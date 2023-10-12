import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

import parentLogger from 'logger';

const logger = parentLogger.child({
  module: 'Services::S3',
});

export const s3Client = new S3Client({ region: process.env.AWS_S3_REGION });

export async function fetchFileStreamFromS3(url: string): Promise<ReadableStream | null> {
  const key = url.replace(`https://${process.env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/`, '');

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
