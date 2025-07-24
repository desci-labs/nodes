import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ok, err, Result } from 'neverthrow';

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
  return `referee_rec_v${API_VERSION}_${originalFileName}`;
}

async function storeSession(fileName: string, session: RefereeRecommenderSession): Promise<Result<void, Error>> {
  try {
    // Note: Later we'll change this to a file hash for security.
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

export const RefereeRecommenderService = {
  generatePresignedUploadUrl,
  getSession,
};
