import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from '@aws-sdk/client-sqs';

import { logger as parentLogger } from '../../logger.js';
import { QueueConfig, QueueType } from './SqsMessageTypes.js';

const logger = parentLogger.child({
  module: 'Sqs::SqsQueueService',
});

export class SqsService {
  private client: SQSClient;
  private queues: Map<QueueType, QueueConfig> = new Map();

  constructor() {
    // Initialize AWS client if credentials are available
    if (process.env.AWS_SQS_ACCESS_KEY_ID && process.env.AWS_SQS_SECRET_ACCESS_KEY) {
      this.client = new SQSClient({
        region: process.env.AWS_SQS_REGION || 'us-east-2',
        credentials: {
          accessKeyId: process.env.AWS_SQS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SQS_SECRET_ACCESS_KEY,
        },
      });
    } else {
      logger.warn('AWS SQS credentials not configured');
    }

    // Configure individual queues
    this.configureQueue(QueueType.DATA_MIGRATION, process.env.AWS_SQS_DATA_MIGRATION_QUEUE_URL);
    this.configureQueue(QueueType.ML_TOOL, process.env.AWS_SQS_ML_TOOL_QUEUE_URL);

    this.logQueueConfiguration();
  }

  private configureQueue(queueType: QueueType, queueUrl: string | undefined): void {
    if (queueUrl && this.client) {
      this.queues.set(queueType, {
        url: queueUrl,
        name: queueType,
        isConfigured: true,
      });
      logger.info(`Queue ${queueType} configured: ${queueUrl}`);
    } else {
      this.queues.set(queueType, {
        url: '',
        name: queueType,
        isConfigured: false,
      });
      if (!queueUrl) {
        logger.debug(`Queue ${queueType} not configured - no URL provided`);
      }
    }
  }

  private hasAnyConfiguredQueue(): boolean {
    return Array.from(this.queues.values()).some((queue) => queue.isConfigured);
  }

  private logQueueConfiguration(): void {
    const configuredQueues = Array.from(this.queues.entries())
      .filter(([_, config]) => config.isConfigured)
      .map(([type, _]) => type);

    if (configuredQueues.length > 0) {
      logger.info(`SQS Service initialized with queues: ${configuredQueues.join(', ')}`);
    } else {
      logger.warn(
        `No SQS queues configured. Will use local processing for development.
        Configure these ENVs to enable SQS queuing:
        - AWS_SQS_ACCESS_KEY_ID
        - AWS_SQS_SECRET_ACCESS_KEY  
        - AWS_SQS_DATA_MIGRATION_QUEUE_URL
        - AWS_SQS_ML_TOOL_QUEUE_URL`,
      );
    }
  }

  get configured(): boolean {
    return this.hasAnyConfiguredQueue();
  }

  isQueueConfigured(queueType: QueueType): boolean {
    return this.queues.get(queueType)?.isConfigured ?? false;
  }

  async sendMessage(queueType: QueueType, messageBody: any): Promise<string | undefined> {
    const queue = this.queues.get(queueType);
    if (!queue?.isConfigured) {
      throw new Error(`Queue ${queueType} is not configured`);
    }

    try {
      const command = new SendMessageCommand({
        QueueUrl: queue.url,
        MessageBody: JSON.stringify(messageBody),
      });

      const response = await this.client.send(command);
      logger.debug({ queueType, messageId: response.MessageId }, 'Message sent to SQS');
      return response.MessageId;
    } catch (error) {
      logger.error({ error, queueType }, 'Error sending message to SQS');
      throw error;
    }
  }

  async receiveMessage(queueType: QueueType) {
    const queue = this.queues.get(queueType);
    if (!queue?.isConfigured) {
      throw new Error(`Queue ${queueType} is not configured`);
    }

    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: queue.url,
        MaxNumberOfMessages: 1,
        VisibilityTimeout: 600,
        WaitTimeSeconds: 20, // Long polling
      });

      const response = await this.client.send(command);
      return response.Messages?.[0];
    } catch (error) {
      logger.error({ error, queueType }, 'Error receiving message from SQS');
      throw error;
    }
  }

  async deleteMessage(queueType: QueueType, receiptHandle: string) {
    const queue = this.queues.get(queueType);
    if (!queue?.isConfigured) {
      throw new Error(`Queue ${queueType} is not configured`);
    }

    try {
      const command = new DeleteMessageCommand({
        QueueUrl: queue.url,
        ReceiptHandle: receiptHandle,
      });

      await this.client.send(command);
      logger.debug({ queueType }, 'Message deleted from SQS');
      return true;
    } catch (error) {
      logger.error({ error, queueType }, 'Error deleting message from SQS');
      throw error;
    }
  }

  async extendMessageVisibility(queueType: QueueType, receiptHandle: string, timeoutSeconds: number) {
    const queue = this.queues.get(queueType);
    if (!queue?.isConfigured) return true;

    try {
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: queue.url,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: timeoutSeconds,
      });

      await this.client.send(command);
      logger.debug({ queueType, timeoutSeconds }, 'Extended message visibility');
      return true;
    } catch (error) {
      logger.error({ error, queueType }, 'Error extending message visibility');
      throw error;
    }
  }
}

export const sqsService = new SqsService();
