import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from '@aws-sdk/client-sqs';

import { logger as parentLogger } from '../../logger.js';

const logger = parentLogger.child({
  module: 'Sqs::SqsQueueService',
});

export class SqsService {
  private client: SQSClient;
  private queueUrl: string;
  private isConfigured: boolean = false;

  constructor() {
    if (
      !process.env.AWS_SQS_ACCESS_KEY_ID ||
      !process.env.AWS_SQS_SECRET_ACCESS_KEY ||
      !process.env.AWS_SQS_QUEUE_URL
    ) {
      logger.warn(
        `SQS Queue is not configured, Will use local processing for development.
        Make sure to configure these ENVs to enable SQS Queuing:
         AWS_SQS_ACCESS_KEY_ID, AWS_SQS_SECRET_ACCESS_KEY, and AWS_SQS_QUEUE_URL must be set to enable SQS Queuing`,
      );
      this.isConfigured = false;
      return;
    }

    this.client = new SQSClient({
      region: process.env.AWS_SQS_REGION || 'us-east-2',
      credentials: {
        accessKeyId: process.env.AWS_SQS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SQS_SECRET_ACCESS_KEY || '',
      },
    });
    this.queueUrl = process.env.AWS_SQS_QUEUE_URL;
    this.isConfigured = true;

    logger.info(`SQS Service initialized for queue: ${this.queueUrl}`);
  }

  get configured(): boolean {
    return this.isConfigured;
  }

  async sendMessage(messageBody: any): Promise<string | undefined> {
    try {
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(messageBody),
      });

      const response = await this.client.send(command);
      return response.MessageId;
    } catch (error) {
      logger.error('Error sending message to SQS', { error });
      throw error;
    }
  }

  async receiveMessage() {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: 1,
        VisibilityTimeout: 600,
        WaitTimeSeconds: 20, // Long polling
      });

      const response = await this.client.send(command);
      return response.Messages?.[0];
    } catch (error) {
      logger.error('Error receiving message from SQS', { error });
      throw error;
    }
  }

  async deleteMessage(receiptHandle: string) {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      logger.error('Error deleting message from SQS', { error });
      throw error;
    }
  }

  async extendMessageVisibility(receiptHandle: string, timeoutSeconds: number) {
    if (!this.isConfigured) return true;

    try {
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: timeoutSeconds,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      logger.error('Error extending message visibility', { error });
      throw error;
    }
  }
}

export const sqsService = new SqsService();
