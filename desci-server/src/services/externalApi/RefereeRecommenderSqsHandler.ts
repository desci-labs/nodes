import { ExternalApi, Prisma } from '@prisma/client';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { ExternalApiSqsMessage, SqsMessageType, BaseSqsMessage, QueueType } from '../sqs/SqsMessageTypes.js';
import { sqsService } from '../sqs/SqsService.js';
import { emitWebsocketEvent, WebSocketEventType } from '../websocketService.js';

import { RefereeRecommenderService, SESSION_TTL_SECONDS } from './RefereeRecommenderService.js';

const logger = parentLogger.child({ module: 'RefereeRecommender::SqsHandler' });

interface RefereeRecommenderQueryingData {
  fileName: string;
  eventType: string;
  fileHash?: string;
}

interface RefereeRecommenderUsageData {
  eventType: string;
  originalFileName: string;
  timestamp: string;
  sessionCreatedAt: number;
  sessionExpiresAt: number;
  [key: string]: any; // Add index signature for Prisma compatibility
}

export class RefereeRecommenderSqsHandler {
  private isProcessing = false;

  async start(): Promise<void> {
    if (!sqsService.isQueueConfigured(QueueType.ML_TOOL)) {
      logger.warn('ML_TOOL queue not configured, referee recommender handler will not start');
      return;
    }

    logger.info('Starting Referee Recommender SQS handler');
    this.isProcessing = true;

    // Start polling for messages
    this.pollMessages();
  }

  stop(): void {
    logger.info('Stopping Referee Recommender SQS handler');
    this.isProcessing = false;
  }

  private async pollMessages(): Promise<void> {
    while (this.isProcessing) {
      try {
        const message = await sqsService.receiveMessage(QueueType.ML_TOOL);

        if (message) {
          const processed = await this.processMessage(message);
          if (processed) {
            await sqsService.deleteMessage(QueueType.ML_TOOL, message.ReceiptHandle!);
          }
        }
      } catch (error) {
        logger.error({ error }, 'Error in SQS polling loop');
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s before retry
      }
    }
  }

  private async processMessage(message: any): Promise<boolean> {
    try {
      const baseMessage: BaseSqsMessage = JSON.parse(message.Body);

      // Only process external API messages
      if (baseMessage.messageType !== SqsMessageType.EXTERNAL_REFEREE_RECOMMENDER_API) {
        logger.debug({ messageType: baseMessage.messageType }, '[SQS] Ignoring non-referee-recommender message');
        return false; // Don't delete, let other handlers process it
      }

      const eventData = baseMessage as ExternalApiSqsMessage;
      logger.info(
        { eventType: eventData.eventType, fileName: eventData.file_name },
        '[SQS] Processing referee recommender event',
      );

      debugger;
      const fileUrl = eventData.data.file_url;
      const hashedFileUrl = RefereeRecommenderService.prepareSessionCacheKey(fileUrl);
      eventData.fileUrlHashed = hashedFileUrl; // Attach hashed version of file url

      // Look up user sessions from Redis using filename
      const sessionsResult = await RefereeRecommenderService.getSessionsByFileUrl(fileUrl);
      if (sessionsResult.isErr()) {
        logger.warn(
          { fileName: eventData.file_name, error: sessionsResult.error.message },
          'User sessions not found in Redis, skipping message',
        );
        return true; // Delete message since we can't process it
      }

      const sessions = sessionsResult.value;

      // Save to database only for successfully completed processing
      if (eventData.eventType === 'PROCESSING_COMPLETED') {
        await Promise.all(sessions.map((session) => this.saveToDatabase(eventData, session)));
      }

      // Emit websocket events to all users who requested this file
      sessions.forEach((session) => {
        this.emitWebsocketEvent(eventData, session);
      });

      logger.info(
        { fileName: eventData.file_name, userCount: sessions.length },
        'Updated database and emited websocket events for this file',
      );

      return true; // Successfully processed, can delete
    } catch (error) {
      logger.error({ error, messageBody: message.Body }, 'Failed to process SQS message');
      throw error;
    }
  }

  private emitWebsocketEvent(eventData: ExternalApiSqsMessage, session: any): void {
    try {
      let eventType: WebSocketEventType;
      let eventPayload: any;
      switch (eventData.eventType) {
        case 'PROCESSING_COMPLETED':
          eventType = WebSocketEventType.REFEREE_REC_PROCESSING_COMPLETED;
          eventPayload = {
            fileName: eventData.file_name,
            originalFileName: session.originalFileName,
            status: 'completed',
            timestamp: new Date().toISOString(),
            fileUrlHashed: eventData.fileUrlHashed,
            paperTitle: eventData.data?.paper_title,
          };
          break;

        case 'PROCESSING_FAILED':
          eventType = WebSocketEventType.REFEREE_REC_PROCESSING_FAILED;
          eventPayload = {
            fileName: eventData.file_name,
            originalFileName: session.originalFileName,
            status: 'failed',
            error: eventData.data?.error || 'Processing failed',
            timestamp: new Date().toISOString(),
            fileUrlHashed: eventData.fileUrlHashed,
            paperTitle: eventData.data?.paper_title,
          };
          break;

        case 'PROCESSING_STARTED':
          eventType = WebSocketEventType.REFEREE_REC_PROCESSING_STARTED;
          eventPayload = {
            fileName: eventData.file_name,
            originalFileName: session.originalFileName,
            status: 'started',
            timestamp: new Date().toISOString(),
            fileUrlHashed: eventData.fileUrlHashed,
            paperTitle: eventData.data?.paper_title,
          };
          break;

        case 'PROCESSING_PROGRESS':
          eventType = WebSocketEventType.REFEREE_REC_PROCESSING_PROGRESS;
          eventPayload = {
            fileName: eventData.file_name,
            originalFileName: session.originalFileName,
            status: 'processing',
            progress: eventData.data?.progress_percent || 0,
            message: eventData.data?.message || '',
            timestamp: new Date().toISOString(),
            fileUrlHashed: eventData.fileUrlHashed,
            paperTitle: eventData.data?.paper_title,
          };
          break;

        default:
          logger.warn(
            { eventType: eventData.eventType, userId: session.userId },
            'Unknown event type for websocket notification',
          );
          return;
      }

      emitWebsocketEvent(session.userId, {
        type: eventType,
        data: eventPayload,
      });

      logger.info(
        {
          userId: session.userId,
          eventType: eventData.eventType,
          fileName: eventData.file_name,
        },
        'Emitted websocket event for referee recommender',
      );
    } catch (error) {
      logger.error(
        {
          error,
          userId: session.userId,
          eventType: eventData.eventType,
          fileName: eventData.file_name,
        },
        'Failed to emit websocket event',
      );
    }
  }

  private async saveToDatabase(eventData: ExternalApiSqsMessage, session: any): Promise<void> {
    try {
      // Check if we already have a session record for this user and file
      const existing = await prisma.externalApiUsage.findFirst({
        where: {
          userId: session.userId,
          apiType: ExternalApi.REFEREE_FINDER,
          queryingData: {
            path: ['fileName'],
            equals: eventData.file_name,
          },
        },
        orderBy: {
          createdAt: 'desc', // Get the most recent record
        },
      });

      if (existing) {
        // Check if the existing session is still valid
        const existingData = existing.data as unknown as RefereeRecommenderUsageData;
        const existingSessionCreatedAt = existingData.sessionCreatedAt;
        const existingSessionExpiresAt = existingData.sessionExpiresAt;
        const isExistingSessionValid = Date.now() < existingSessionExpiresAt;

        if (isExistingSessionValid) {
          // Valid session already exists - don't create duplicate
          logger.debug(
            {
              userId: session.userId,
              recordId: existing.id,
              existingSessionAge: (Date.now() - existingSessionCreatedAt) / 1000,
            },
            'Valid session already exists, skipping',
          );
          return;
        }

        // Existing session is expired, continue to create new record
        logger.debug(
          {
            userId: session.userId,
            recordId: existing.id,
            existingSessionAge: (Date.now() - existingSessionCreatedAt) / 1000,
          },
          'Existing session expired, creating new record',
        );
      }

      // Create new record for this session
      // Separate queryable data (GIN indexed) from metadata
      const queryingData: RefereeRecommenderQueryingData = {
        fileName: eventData.file_name,
        eventType: eventData.eventType,
        ...(eventData.file_hash && { fileHash: eventData.file_hash }),
      };

      const metadataData: RefereeRecommenderUsageData = {
        eventType: eventData.eventType,
        originalFileName: session.originalFileName,
        timestamp: new Date().toISOString(),
        sessionCreatedAt: session.createdAt,
        sessionExpiresAt: session.createdAt + SESSION_TTL_SECONDS * 1000,
      };

      await prisma.externalApiUsage.create({
        data: {
          userId: session.userId,
          apiType: ExternalApi.REFEREE_FINDER,
          queryingData: queryingData as unknown as Prisma.JsonValue, // Fast queries on this field
          data: metadataData, // Full metadata storage
        },
      });

      // Mark session as completed (remove from active tracking)
      await RefereeRecommenderService.markSessionAsCompleted(session.userId, eventData.file_name);

      logger.debug({ userId: session.userId }, 'Referee recommender usage saved to database');
    } catch (error) {
      logger.error({ error, eventData, session }, 'Failed to save referee recommender usage to database');

      // Clean up failed processing session
      await RefereeRecommenderService.handleProcessingFailure(session.userId, eventData.file_name);

      throw error;
    }
  }
}

export const refereeRecommenderSqsHandler = new RefereeRecommenderSqsHandler();
