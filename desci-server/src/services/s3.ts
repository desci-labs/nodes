import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({
  module: 'Services::S3',
});

export const isS3Configured = process.env.AWS_S3_BUCKET_NAME && process.env.AWS_S3_BUCKET_REGION;
export const s3Client = isS3Configured
  ? new S3Client({
      region: process.env.AWS_S3_BUCKET_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
  : null;

export async function fetchFileStreamFromS3(key: string): Promise<ReadableStream | null> {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
  };

  try {
    const data = await s3Client.send(new GetObjectCommand(params));
    return data.Body as ReadableStream;
  } catch (error) {
    logger.error('Error fetching from S3:', error);
    return null;
  }
}
