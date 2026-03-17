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

// Note: PutObjectCommand does not set ContentLength and does not use multipart upload.
// For large objects, callers should pass a Buffer (or a known-length stream) rather than
// an unbounded Readable. For objects exceeding ~5GB, implement multipart upload via
// @aws-sdk/lib-storage Upload class instead.
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
  logger.info({ keyPrefix: key.split('/').slice(0, 2).join('/') + '/...' }, 'Uploaded to R2');
}

export async function getStreamFromR2(key: string): Promise<{ stream: Readable; metadata: Record<string, string> }> {
  if (!r2Client) throw new Error('R2 is not configured');
  const response = await r2Client.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }),
  );
  if (!response.Body) {
    throw new Error(`R2 returned empty body for key "${key}" in bucket "${process.env.R2_BUCKET_NAME}"`);
  }
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
  logger.info({ keyPrefix: key.split('/').slice(0, 2).join('/') + '/...' }, 'Deleted from R2');
}

export type R2ObjectEntry = { key: string; size: number; lastModified: Date | undefined };

export async function* listR2ObjectsPages(
  prefix: string,
): AsyncGenerator<R2ObjectEntry[]> {
  if (!r2Client) throw new Error('R2 is not configured');
  let continuationToken: string | undefined;

  do {
    const response = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const page: R2ObjectEntry[] = [];
    for (const obj of response.Contents ?? []) {
      if (obj.Key) {
        page.push({
          key: obj.Key,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified,
        });
      }
    }
    if (page.length > 0) yield page;
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
}

export async function listR2Objects(prefix: string): Promise<R2ObjectEntry[]> {
  const results: R2ObjectEntry[] = [];
  for await (const page of listR2ObjectsPages(prefix)) {
    results.push(...page);
  }
  return results;
}
