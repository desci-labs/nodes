import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({
  module: 'Services::R2',
});

export const isR2Configured =
  !!process.env.R2_ACCOUNT_ID &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  !!process.env.R2_BUCKET_NAME;

export const r2Client = isR2Configured
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

export async function uploadToR2(
  key: string,
  body: Buffer | Readable,
  metadata?: Record<string, string>,
): Promise<void> {
  if (!r2Client) throw new Error('R2 is not configured');
  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: body,
      Metadata: metadata,
    }),
  );
  logger.info({ key }, 'Uploaded to R2');
}

export async function getStreamFromR2(key: string): Promise<{ stream: Readable; metadata: Record<string, string> }> {
  if (!r2Client) throw new Error('R2 is not configured');
  const response = await r2Client.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }),
  );
  return {
    stream: response.Body as Readable,
    metadata: response.Metadata ?? {},
  };
}

export async function deleteFromR2(key: string): Promise<void> {
  if (!r2Client) throw new Error('R2 is not configured');
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }),
  );
  logger.info({ key }, 'Deleted from R2');
}

export async function listR2Objects(
  prefix: string,
): Promise<{ key: string; size: number; lastModified: Date | undefined }[]> {
  if (!r2Client) throw new Error('R2 is not configured');
  const results: { key: string; size: number; lastModified: Date | undefined }[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of response.Contents ?? []) {
      if (obj.Key) {
        results.push({
          key: obj.Key,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified,
        });
      }
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return results;
}
