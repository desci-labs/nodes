export enum SqsMessageType {
  DATA_MIGRATION = 'DATA_MIGRATION',
  EXTERNAL_REFEREE_RECOMMENDER_API = 'EXTERNAL_REFEREE_RECOMMENDER_API',
}

export enum QueueType {
  DATA_MIGRATION = 'DATA_MIGRATION',
  ML_TOOL = 'ML_TOOL',
}

export interface QueueConfig {
  url: string;
  name: string;
  isConfigured: boolean;
}

export interface BaseSqsMessage {
  messageType: SqsMessageType;
}

export interface DataMigrationSqsMessage extends BaseSqsMessage {
  messageType: SqsMessageType.DATA_MIGRATION;
  migrationId: number;
  migrationType: string;
}

export interface ExternalApiSqsMessage extends BaseSqsMessage {
  messageType: SqsMessageType.EXTERNAL_REFEREE_RECOMMENDER_API;
  eventType: 'PROCESSING_STARTED' | 'PROCESSING_COMPLETED' | 'PROCESSING_FAILED';
  file_name: string; // e.g., "referee_rec_v0.1.3_{original_file.pdf}" // Move to hashes later for security.
  data?: any;
}
