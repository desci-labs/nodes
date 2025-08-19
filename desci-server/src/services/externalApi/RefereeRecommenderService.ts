import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

import { ExternalApi, Feature } from '@prisma/client';
import axios from 'axios';
import { ok, err, Result } from 'neverthrow';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { setToCache, getFromCache } from '../../redisClient.js';
import { FeatureLimitsService } from '../FeatureLimits/FeatureLimitsService.js';

const logger = parentLogger.child({ module: 'RefereeRecommender::Service' });

export const SESSION_TTL_SECONDS = 86400; // 24 hours

const API_VERSION = process.env.REFEREE_RECOMMENDER_VERSION || '0.1.3';

// ML Referee API endpoints
const ML_REFEREE_TRIGGER_URL = process.env.ML_REFEREE_TRIGGER_START;
const ML_REFEREE_RESULTS_URL = process.env.ML_REFEREE_FINDER_RESULT;
const ML_REFEREE_GET_PRESIGNED_URL = process.env.ML_REFEREE_GET_PRESIGNED_URL;

interface PresignedUrlRequest {
  userId: number;
  originalFileName: string;
}

interface RefereeRecommenderSession {
  userId: number;
  hashedFileUrl: string;
  createdAt: number;
}

interface PresignedUrlResponse {
  presignedUrl: string;
  fileName: string;
}

interface TriggerRefereeRequest {
  file_url: string;
  hash_value?: string;
  hash_verified?: boolean;
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
  uploaded_file_name: string;
  api_version: string;
  info: string;
}

interface GetRefereeResultsResponse {
  status: string;
  UploadedFileName: string;
  result?: any;
}

/**
 * Hashes a file URL with SHA256, and encodes it in Base64
 * This is for a short cache key in redis for URLs, S3 file URLs can be around ~1500 chars otherwise.
 * @param fileUrl - The file URL to hash
 * @returns The Base64-encoded hash of the file URL
 */
function prepareCacheKey(fileUrl: string) {
  // string -> SHA256 -> Base64
  return createHash('sha256').update(fileUrl).digest('base64'); // ~44 chars with '=' padding
}

async function generatePresignedUploadUrl(request: PresignedUrlRequest): Promise<Result<PresignedUrlResponse, Error>> {
  try {
    // Check feature limits first
    const limitCheck = await FeatureLimitsService.checkFeatureLimit(request.userId, Feature.REFEREE_FINDER);

    if (limitCheck.isErr()) {
      logger.error(
        { error: limitCheck.error, userId: request.userId },
        'Failed to check feature limits for presigned URL generation',
      );
      return err(new Error('Failed to check feature limits'));
    }

    const limitStatus = limitCheck.value;
    if (!limitStatus.isWithinLimit) {
      logger.warn(
        {
          userId: request.userId,
          currentUsage: limitStatus.currentUsage,
          useLimit: limitStatus.useLimit,
          planCodename: limitStatus.planCodename,
        },
        'User exceeded feature limit for referee finder',
      );
      return err(
        new Error(
          `Feature limit exceeded. You have used ${limitStatus.currentUsage}/${limitStatus.useLimit} requests this month. Please upgrade your plan to continue.`,
        ),
      );
    }

    logger.info(
      {
        userId: request.userId,
        currentUsage: limitStatus.currentUsage,
        useLimit: limitStatus.useLimit,
        remainingUses: limitStatus.remainingUses,
        planCodename: limitStatus.planCodename,
      },
      'Feature limit check passed for presigned URL generation',
    );

    // Call external endpoint to get presigned URL
    const fileName = generateFileName(request.originalFileName);

    if (!ML_REFEREE_GET_PRESIGNED_URL) {
      return err(new Error('ML_REFEREE_GET_PRESIGNED_URL environment variable not configured'));
    }

    const presignedResponse = await axios.get(ML_REFEREE_GET_PRESIGNED_URL, {
      params: {
        file_name: fileName,
      },
    });

    if (presignedResponse.status !== 200) {
      return err(new Error(`Presigned URL service returned status ${presignedResponse.status}`));
    }

    const { upload_url, download_url, s3_file_name } = presignedResponse.data;

    // Use download_url for cache key and store hashedFileUrl in session
    const hashedFileUrl = prepareCacheKey(download_url);

    // Store session in Redis using the hashed download URL
    const storeResult = await storeSession(hashedFileUrl, {
      userId: request.userId,
      hashedFileUrl,
      createdAt: Date.now(),
    });

    if (storeResult.isErr()) {
      return err(storeResult.error);
    }

    await markSessionAsActive(request.userId, hashedFileUrl);

    logger.info(
      {
        userId: request.userId,
        originalFileName: request.originalFileName,
        s3FileName: s3_file_name,
        hashedFileUrl,
      },
      'Generated presigned URL for referee recommender via external endpoint',
    );

    return ok({ presignedUrl: upload_url, downloadUrl: download_url, fileName: s3_file_name });
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
    const userCacheKey = `referee-recommender-session:${session.userId}:${fileName}`;
    await setToCache(userCacheKey, session, SESSION_TTL_SECONDS);

    // Store/append to filename-based lookup for SQS handler
    const filenameCacheKey = `referee-recommender-filename:${fileName}`;
    const existingSessions = (await getFromCache<RefereeRecommenderSession[]>(filenameCacheKey)) || [];

    const now = Date.now();

    // Filter out expired sessions and sessions for this user
    const validSessions = existingSessions.filter((s) => {
      const sessionAge = (now - s.createdAt) / 1000; // seconds
      return sessionAge < SESSION_TTL_SECONDS && s.userId !== session.userId;
    });

    // Add the new session
    validSessions.push(session);

    await setToCache(filenameCacheKey, validSessions, SESSION_TTL_SECONDS);

    logger.debug(
      {
        fileName,
        userId: session.userId,
        sessionCount: validSessions.length,
      },
      'Stored referee recommender session in Redis',
    );
    return ok(undefined);
  } catch (error) {
    logger.error({ error, fileName }, 'Failed to store session in Redis');
    return err(error instanceof Error ? error : new Error('Failed to store session in Redis'));
  }
}

async function getSession(fileName: string, userId: number): Promise<Result<RefereeRecommenderSession, Error>> {
  try {
    const cacheKey = `referee-recommender-session:${userId}:${fileName}`;
    const session = await getFromCache<RefereeRecommenderSession>(cacheKey);

    if (session) {
      logger.debug({ fileName, userId: session.userId }, 'Found referee recommender session');
      return ok(session);
    }

    logger.debug({ fileName, userId }, 'Session not found in Redis');
    return err(new Error('Session not found'));
  } catch (error) {
    logger.error({ error, fileName, userId }, 'Failed to get session from Redis');
    return err(error instanceof Error ? error : new Error('Failed to get session from Redis'));
  }
}

async function getSessionsByFileName(fileName: string): Promise<Result<RefereeRecommenderSession[], Error>> {
  try {
    const filenameCacheKey = `referee-recommender-filename:${fileName}`;
    const sessions = await getFromCache<RefereeRecommenderSession[]>(filenameCacheKey);

    if (sessions && sessions.length > 0) {
      const now = Date.now();

      // Filter out any sessions that should have expired
      const validSessions = sessions.filter((s) => {
        const sessionAge = (now - s.createdAt) / 1000; // seconds
        return sessionAge < SESSION_TTL_SECONDS;
      });

      if (validSessions.length > 0) {
        // Update cache with only valid sessions if any were filtered out
        if (validSessions.length !== sessions.length) {
          const earliestExpiry = Math.min(...validSessions.map((s) => s.createdAt + SESSION_TTL_SECONDS * 1000));
          const remainingTtl = Math.max(1, Math.floor((earliestExpiry - now) / 1000));
          await setToCache(filenameCacheKey, validSessions, remainingTtl);

          logger.debug(
            {
              fileName,
              filteredCount: sessions.length - validSessions.length,
              validCount: validSessions.length,
            },
            'Filtered expired sessions from filename cache',
          );
        }

        logger.debug({ fileName, userCount: validSessions.length }, 'Found valid sessions by filename');
        return ok(validSessions);
      }
    }

    logger.debug({ fileName }, 'No valid sessions found by filename');
    return err(new Error('Sessions not found'));
  } catch (error) {
    logger.error({ error, fileName }, 'Failed to get sessions by filename');
    return err(error instanceof Error ? error : new Error('Failed to get sessions by filename'));
  }
}

async function triggerRefereeRecommendation(
  request: TriggerRefereeRequest,
  userId: number,
): Promise<Result<TriggerRefereeResponse, Error>> {
  try {
    // Check feature limits first
    const limitCheck = await FeatureLimitsService.checkFeatureLimit(userId, Feature.REFEREE_FINDER);

    if (limitCheck.isErr()) {
      logger.error(
        { error: limitCheck.error, userId },
        'Failed to check feature limits for referee recommendation trigger',
      );
      return err(new Error('Failed to check feature limits'));
    }

    const limitStatus = limitCheck.value;
    if (!limitStatus.isWithinLimit) {
      logger.warn(
        {
          userId,
          currentUsage: limitStatus.currentUsage,
          useLimit: limitStatus.useLimit,
          planCodename: limitStatus.planCodename,
        },
        'User exceeded feature limit for referee finder',
      );
      return err(
        new Error(
          `Feature limit exceeded. You have used ${limitStatus.currentUsage}/${limitStatus.useLimit} requests this month. Please upgrade your plan to continue.`,
        ),
      );
    }

    logger.info(
      {
        userId,
        currentUsage: limitStatus.currentUsage,
        useLimit: limitStatus.useLimit,
        remainingUses: limitStatus.remainingUses,
        planCodename: limitStatus.planCodename,
      },
      'Feature limit check passed for referee recommendation trigger',
    );

    logger.info(
      {
        file_url: request.file_url,
        hash_value: request.hash_value,
        hash_verified: request.hash_verified,
      },
      'Triggering referee recommendation',
    );

    const response = await axios.post(ML_REFEREE_TRIGGER_URL, request, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60 seconds
    });

    if (response.status !== 200) {
      return err(new Error(`ML Referee API returned status ${response.status}`));
    }

    // Store session for URL-based requests
    if (response.data.uploaded_file_name) {
      // Use prepareCacheKey on the fileUrl for consistent hashing
      const hashedFileUrl = prepareCacheKey(request.file_url);

      const session: RefereeRecommenderSession = {
        userId,
        hashedFileUrl,
        createdAt: Date.now(),
      };

      await storeSession(response.data.uploaded_file_name, session);
      await markSessionAsActive(userId, response.data.uploaded_file_name);

      logger.debug(
        {
          userId,
          file_url: request.file_url,
          hash_value: request.hash_value,
          hashedFileUrl,
          uploadedFileName: response.data.uploaded_file_name,
        },
        'Stored URL-based session and marked as active',
      );
    }

    logger.info(
      {
        file_url: request.file_url,
        hash_value: request.hash_value,
        hash_verified: request.hash_verified,
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

async function getUserUsageCount(userId: number, timeframeSeconds: number): Promise<number> {
  const timeframeStart = Date.now() - timeframeSeconds * 1000;

  // Count completed usage from database
  const completedCount = await prisma.externalApiUsage.count({
    where: {
      userId,
      apiType: ExternalApi.REFEREE_FINDER,
      createdAt: {
        gte: new Date(timeframeStart),
      },
    },
  });

  // Count active sessions from Redis (sessions created but not yet processed)
  const activeSessionsCount = await getActiveSessionsCount(userId, timeframeStart);

  logger.debug(
    {
      userId,
      timeframeSeconds,
      completedCount,
      activeSessionsCount,
      totalCount: completedCount + activeSessionsCount,
    },
    'Calculated user usage count',
  );

  return completedCount + activeSessionsCount;
}

async function getUserUsageCountFromDate(userId: number, periodStart: Date): Promise<number> {
  const timeframeStart = periodStart.getTime();

  // Count completed usage from database
  const completedCount = await prisma.externalApiUsage.count({
    where: {
      userId,
      apiType: ExternalApi.REFEREE_FINDER,
      createdAt: {
        gte: periodStart,
      },
    },
  });

  // Count active sessions from Redis (sessions created but not yet processed)
  const activeSessionsCount = await getActiveSessionsCount(userId, timeframeStart);

  logger.debug(
    {
      userId,
      periodStart,
      completedCount,
      activeSessionsCount,
      totalCount: completedCount + activeSessionsCount,
    },
    'Calculated user usage count from period start',
  );

  return completedCount + activeSessionsCount;
}

async function getActiveSessionsCount(userId: number, timeframeStart: number): Promise<number> {
  try {
    // Get user's active sessions list
    const activeSessionsKey = `referee-recommender-active:${userId}`;
    const activeSessions = (await getFromCache<string[]>(activeSessionsKey)) || [];

    let activeCount = 0;
    const validSessions: string[] = [];

    // Check each session to see if it's still valid and within timeframe
    for (const sessionId of activeSessions) {
      const sessionKey = `referee-recommender-session:${userId}:${sessionId}`;
      const session = await getFromCache<RefereeRecommenderSession>(sessionKey);

      if (
        session &&
        session.createdAt >= timeframeStart &&
        Date.now() - session.createdAt < SESSION_TTL_SECONDS * 1000
      ) {
        activeCount++;
        validSessions.push(sessionId);
      }
    }

    // Clean up stale sessions from the active list if any were filtered out
    if (validSessions.length !== activeSessions.length) {
      if (validSessions.length > 0) {
        await setToCache(activeSessionsKey, validSessions, SESSION_TTL_SECONDS);
      } else {
        // Delete the key if no valid sessions remain
        await setToCache(activeSessionsKey, [], 1);
      }

      logger.debug(
        {
          userId,
          removedCount: activeSessions.length - validSessions.length,
          validCount: validSessions.length,
        },
        'Cleaned up expired sessions from active list',
      );
    }

    return activeCount;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get active sessions count');
    return 0; // Fail open - don't block user on Redis errors
  }
}

async function markSessionAsActive(userId: number, fileName: string): Promise<void> {
  try {
    const activeSessionsKey = `referee-recommender-active:${userId}`;
    const activeSessions = (await getFromCache<string[]>(activeSessionsKey)) || [];

    // Add this filename to active sessions if not already present
    if (!activeSessions.includes(fileName)) {
      activeSessions.push(fileName);
      await setToCache(activeSessionsKey, activeSessions, SESSION_TTL_SECONDS);
    }
  } catch (error) {
    logger.error({ error, userId, fileName }, 'Failed to mark session as active');
  }
}

async function markSessionAsCompleted(userId: number, fileName: string): Promise<void> {
  try {
    const activeSessionsKey = `referee-recommender-active:${userId}`;
    const activeSessions = (await getFromCache<string[]>(activeSessionsKey)) || [];

    // Remove this filename from active sessions
    const updatedSessions = activeSessions.filter((session) => session !== fileName);

    if (updatedSessions.length > 0) {
      await setToCache(activeSessionsKey, updatedSessions, SESSION_TTL_SECONDS);
    } else {
      // Delete the key if no active sessions remain
      await setToCache(activeSessionsKey, [], 1); // Short TTL to effectively delete
    }
  } catch (error) {
    logger.error({ error, userId, fileName }, 'Failed to mark session as completed');
  }
}

async function checkRateLimit(userId: number, limit: number, timeframeSeconds: number): Promise<Result<void, Error>> {
  try {
    // Proactively clean up expired sessions before checking usage
    await cleanupExpiredSessions(userId);

    const currentUsage = await getUserUsageCount(userId, timeframeSeconds);

    if (currentUsage >= limit) {
      logger.warn(
        {
          userId,
          currentUsage,
          limit,
          timeframeSeconds,
        },
        'User exceeded rate limit',
      );

      return err(new Error(`Rate limit exceeded. ${currentUsage}/${limit} requests in the last ${timeframeSeconds}s`));
    }

    logger.debug(
      {
        userId,
        currentUsage,
        limit,
        timeframeSeconds,
      },
      'Rate limit check passed',
    );

    return ok(undefined);
  } catch (error) {
    logger.error({ error, userId }, 'Failed to check rate limit');
    return err(error instanceof Error ? error : new Error('Failed to check rate limit'));
  }
}

async function handleProcessingFailure(userId: number, fileName: string): Promise<void> {
  try {
    // Remove from active sessions since processing failed
    await markSessionAsCompleted(userId, fileName);

    logger.debug({ userId, fileName }, 'Cleaned up failed processing session');
  } catch (error) {
    logger.error({ error, userId, fileName }, 'Failed to clean up failed processing session');
  }
}

async function cleanupExpiredSessions(userId: number): Promise<void> {
  try {
    const activeSessionsKey = `referee-recommender-active:${userId}`;
    const activeSessions = (await getFromCache<string[]>(activeSessionsKey)) || [];

    if (activeSessions.length === 0) {
      return;
    }

    const validSessions: string[] = [];
    const now = Date.now();

    // Check each session to see if it's still valid
    for (const sessionId of activeSessions) {
      const sessionKey = `referee-recommender-session:${userId}:${sessionId}`;
      const session = await getFromCache<RefereeRecommenderSession>(sessionKey);

      if (session && now - session.createdAt < SESSION_TTL_SECONDS * 1000) {
        validSessions.push(sessionId);
      }
    }

    // Update the active sessions list
    if (validSessions.length !== activeSessions.length) {
      if (validSessions.length > 0) {
        await setToCache(activeSessionsKey, validSessions, SESSION_TTL_SECONDS);
      } else {
        await setToCache(activeSessionsKey, [], 1);
      }

      logger.info(
        {
          userId,
          totalSessions: activeSessions.length,
          validSessions: validSessions.length,
          cleanedUp: activeSessions.length - validSessions.length,
        },
        'Cleaned up expired active sessions',
      );
    }
  } catch (error) {
    logger.error({ error, userId }, 'Failed to cleanup expired sessions');
  }
}

export const RefereeRecommenderService = {
  generatePresignedUploadUrl,
  getSession,
  getSessionsByFileName,
  triggerRefereeRecommendation,
  getRefereeResults,
  getUserUsageCount,
  getUserUsageCountFromDate,
  checkRateLimit,
  markSessionAsActive,
  markSessionAsCompleted,
  handleProcessingFailure,
  cleanupExpiredSessions,
};
