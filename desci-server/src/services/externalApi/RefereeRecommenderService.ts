import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ok, err, Result } from 'neverthrow';
import axios from 'axios';
import { randomUUID } from 'crypto';

import { logger as parentLogger } from '../../logger.js';
import { setToCache, getFromCache } from '../../redisClient.js';

const logger = parentLogger.child({ module: 'RefereeRecommender::Service' });

const SESSION_TTL_SECONDS = 86400; // 24 hours

// Initialize S3 client and config at module level
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.REFEREE_RECOMMENDER_S3_BUCKET || '';
const API_VERSION = process.env.REFEREE_RECOMMENDER_VERSION || '0.1.3';

// ML Referee API endpoints
const ML_REFEREE_TRIGGER_URL = process.env.ML_REFEREE_TRIGGER_URL;
const ML_REFEREE_RESULTS_URL = process.env.ML_REFEREE_RESULTS_URL;

interface PresignedUrlRequest {
  userId: number;
  originalFileName: string;
}

interface RefereeRecommenderSession {
  userId: number;
  originalFileName: string;
  createdAt: number;
}

interface PresignedUrlResponse {
  presignedUrl: string;
  fileName: string;
}

interface TriggerRefereeRequest {
  cid: string;
  external?: boolean;
  top_n_closely_matching?: number;
  number_referees?: number;
  force_run?: boolean;
  classify?: boolean;
  coi_filter?: {
    co_author_overlap?: boolean;
    institution_overlap?: boolean;
    supervisor_supervisee_check?: boolean;
  };
  meta_data_only?: boolean;
  exclude_fields?: string[];
  exclude_works?: string[];
  exclude_authors?: string[];
}

interface TriggerRefereeResponse {
  execution_arn?: string;
  uploaded_file_name: string;
  api_version: string;
  info: string;
}

interface GetRefereeResultsResponse {
  status: string;
  UploadedFileName: string;
  result?: any;
}

async function generatePresignedUploadUrl(request: PresignedUrlRequest): Promise<Result<PresignedUrlResponse, Error>> {
  try {
    // Generate filename with convention: referee_rec_v0.1.3_{original_file.pdf}
    const fileName = generateFileName(request.originalFileName);

    // Create presigned URL for upload
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      ContentType: 'application/pdf',
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    // Store session in Redis
    const storeResult = await storeSession(fileName, {
      userId: request.userId,
      originalFileName: request.originalFileName,
      createdAt: Date.now(),
    });

    if (storeResult.isErr()) {
      return err(storeResult.error);
    }

    logger.info(
      {
        userId: request.userId,
        fileName,
      },
      'Generated presigned URL for referee recommender',
    );

    return ok({ presignedUrl, fileName });
  } catch (error) {
    logger.error({ error, request }, 'Failed to generate presigned URL');
    return err(error instanceof Error ? error : new Error('Failed to generate presigned URL'));
  }
}

function generateFileName(originalFileName: string): string {
  const uuid = randomUUID();
  const fileExtension = originalFileName.split('.').pop() || 'pdf';
  const baseName = originalFileName.replace(/\.[^/.]+$/, ''); // Remove extension

  // Format: referee_rec_v{version}_{uuid}_{sanitized_basename}.{ext}
  const sanitizedBaseName = baseName
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace unsafe characters with underscore
    .substring(0, 50); // Limit length

  return `referee_rec_v${API_VERSION}_${uuid}_${sanitizedBaseName}.${fileExtension}`;
}

async function storeSession(fileName: string, session: RefereeRecommenderSession): Promise<Result<void, Error>> {
  try {
    // Use the generated filename (which includes UUID) as the cache key
    const cacheKey = `referee-recommender-session:${fileName}`;
    await setToCache(cacheKey, session, SESSION_TTL_SECONDS);

    logger.debug({ fileName, userId: session.userId }, 'Stored referee recommender session in Redis');
    return ok(undefined);
  } catch (error) {
    logger.error({ error, fileName }, 'Failed to store session in Redis');
    return err(error instanceof Error ? error : new Error('Failed to store session in Redis'));
  }
}

async function getSession(fileName: string): Promise<Result<RefereeRecommenderSession, Error>> {
  try {
    const cacheKey = `referee-recommender-session:${fileName}`;
    const session = await getFromCache<RefereeRecommenderSession>(cacheKey);

    if (session) {
      logger.debug({ fileName, userId: session.userId }, 'Found referee recommender session');
      return ok(session);
    }

    logger.debug({ fileName }, 'Session not found in Redis');
    return err(new Error('Session not found'));
  } catch (error) {
    logger.error({ error, fileName }, 'Failed to get session from Redis');
    return err(error instanceof Error ? error : new Error('Failed to get session from Redis'));
  }
}

async function triggerRefereeRecommendation(
  request: TriggerRefereeRequest,
): Promise<Result<TriggerRefereeResponse, Error>> {
  try {
    logger.info({ cid: request.cid, external: request.external }, 'Triggering referee recommendation');

    const response = await axios.post(ML_REFEREE_TRIGGER_URL, request, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60 seconds
    });

    if (response.status !== 200) {
      return err(new Error(`ML Referee API returned status ${response.status}`));
    }

    logger.info(
      {
        cid: request.cid,
        uploaded_file_name: response.data.uploaded_file_name,
        info: response.data.info,
      },
      'Successfully triggered referee recommendation',
    );

    return ok(response.data);
  } catch (error) {
    logger.error({ error, request }, 'Failed to trigger referee recommendation');

    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error || error.message;
      return err(new Error(`ML Referee API error: ${message}`));
    }

    return err(error instanceof Error ? error : new Error('Failed to trigger referee recommendation'));
  }
}

async function getRefereeResults(uploadedFileName: string): Promise<Result<GetRefereeResultsResponse, Error>> {
  try {
    logger.info({ uploadedFileName }, 'Fetching referee recommendation results');

    const response = await axios.get(ML_REFEREE_RESULTS_URL, {
      params: {
        UploadedFileName: uploadedFileName,
      },
      timeout: 30000, // 30 seconds
    });

    if (response.status !== 200) {
      return err(new Error(`ML Referee Results API returned status ${response.status}`));
    }

    logger.info(
      {
        uploadedFileName,
        status: response.data.status,
      },
      'Successfully fetched referee recommendation results',
    );

    return ok(response.data);
  } catch (error) {
    logger.error({ error, uploadedFileName }, 'Failed to fetch referee results');

    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error || error.message;
      return err(new Error(`ML Referee Results API error: ${message}`));
    }

    return err(error instanceof Error ? error : new Error('Failed to fetch referee results'));
  }
}

export const RefereeRecommenderService = {
  generatePresignedUploadUrl,
  getSession,
  triggerRefereeRecommendation,
  getRefereeResults,
};
