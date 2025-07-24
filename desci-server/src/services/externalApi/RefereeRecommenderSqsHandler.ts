import { ExternalApi } from '@prisma/client';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { ExternalApiSqsMessage, SqsMessageType, BaseSqsMessage } from '../sqs/SqsMessageTypes.js';
import { sqsService } from '../sqs/SqsService.js';

import { RefereeRecommenderService } from './RefereeRecommenderService.js';

const logger = parentLogger.child({ module: 'RefereeRecommender::SqsHandler' });

export class RefereeRecommenderSqsHandler {
  private isProcessing = false;

  async start(): Promise<void> {
    if (!sqsService.configured) {
      logger.warn('SQS not configured, referee recommender handler will not start');
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
        const message = await sqsService.receiveMessage();

        if (message) {
          const processed = await this.processMessage(message);
          if (processed) {
            await sqsService.deleteMessage(message.ReceiptHandle!);
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
        logger.debug({ messageType: baseMessage.messageType }, 'Ignoring non-referee-recommender message');
        return false; // Don't delete, let other handlers process it
      }

      const eventData = baseMessage as ExternalApiSqsMessage;
      logger.info(
        { eventType: eventData.eventType, fileName: eventData.file_name },
        'Processing referee recommender event',
      );

      // Look up user session from Redis using filename
      const sessionResult = await RefereeRecommenderService.getSession(eventData.file_name);
      if (sessionResult.isErr()) {
        logger.warn(
          { fileName: eventData.file_name, error: sessionResult.error.message },
          'User session not found in Redis, skipping message',
        );
        return true; // Delete message since we can't process it
      }

      const session = sessionResult.value;
      await this.saveToDatabase(eventData, session);

      return true; // Successfully processed, can delete
    } catch (error) {
      logger.error({ error, messageBody: message.Body }, 'Failed to process SQS message');
      throw error;
    }
  }

  private async saveToDatabase(eventData: ExternalApiSqsMessage, session: any): Promise<void> {
    try {
      await prisma.externalApiUsage.create({
        data: {
          userId: session.userId,
          apiType: ExternalApi.REFEREE_FINDER,
          data: {
            eventType: eventData.eventType,
            fileName: eventData.file_name,
            originalFileName: session.originalFileName,
            timestamp: new Date().toISOString(),
            sessionCreatedAt: session.createdAt,
            data: eventData.data,
            results: eventData.results,
          },
        },
      });

      logger.debug({ userId: session.userId }, 'Referee recommender usage saved to database');
    } catch (error) {
      logger.error({ error, eventData, session }, 'Failed to save referee recommender usage to database');
      throw error;
    }
  }
}

export const refereeRecommenderSqsHandler = new RefereeRecommenderSqsHandler();
