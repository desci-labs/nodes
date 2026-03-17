import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import { logger as parentLogger } from '../../logger.js';
import { uploadToR2, isR2Configured } from '../../services/r2.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

const logger = parentLogger.child({ module: 'DATA::UploadCentralized' });

const localUpload = multer({ dest: os.tmpdir(), preservePath: true });
const uploadMiddleware = localUpload.array('files');

export const centralizedUploadHandler = (req: Request, res: Response, next: NextFunction): void => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        logger.error({ err }, 'Multer error');
        res.status(400).send({ ok: false, message: err.message });
        return;
      }
      logger.error({ err }, 'Upload error');
      res.status(500).send({ ok: false, message: 'Upload failed' });
      return;
    }
    next();
  });
};

export const uploadCentralized = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const node = (req as any).node;
  const contextPath = req.body.contextPath || '';

  const UNSAFE_PATH_PATTERN = /(\.\.|\\|[\x00-\x1f])/;
  if (contextPath && (contextPath.startsWith('/') || UNSAFE_PATH_PATTERN.test(contextPath))) {
    return res.status(400).send({ ok: false, message: 'Invalid contextPath: must not contain path traversal sequences, backslashes, or control characters' });
  }

  const files = req.files as Express.Multer.File[];

  if (!isR2Configured) {
    return res.status(503).send({ ok: false, message: 'R2 storage is not configured' });
  }

  if (!files || files.length === 0) {
    return res.status(400).send({ ok: false, message: 'No files provided' });
  }

  const nodeUuid = ensureUuidEndsWithDot(node.uuid);

  logger.info({ userId: user.id, nodeUuid, contextPath, fileCount: files.length }, 'Uploading centralized data to R2');

  const uploaded: { path: string; size: number; contentHash: string }[] = [];
  const rejected: { fileName: string; reason: string }[] = [];

  try {
    for (const file of files) {
      if (UNSAFE_PATH_PATTERN.test(file.originalname) || file.originalname.startsWith('/')) {
        logger.warn({ fileName: file.originalname }, 'Rejected unsafe filename');
        rejected.push({ fileName: file.originalname, reason: 'unsafe filename' });
        await fs.promises.unlink(file.path).catch(() => {});
        continue;
      }
      const relativePath = contextPath ? `${contextPath}/${file.originalname}` : file.originalname;
      const r2Key = `${nodeUuid}/${relativePath}`;

      const STREAM_THRESHOLD = 50 * 1024 * 1024; // 50MB
      let hash: string;

      if (file.size > STREAM_THRESHOLD) {
        // Stream large files: compute hash while reading, then upload the file from disk.
        // Note: uploadToR2 uses PutObjectCommand which buffers internally for R2.
        // For truly huge files (>5GB), multipart upload would be needed.
        const hashStream = crypto.createHash('sha256');
        const readStream = fs.createReadStream(file.path);
        for await (const chunk of readStream) {
          hashStream.update(chunk);
        }
        hash = hashStream.digest('hex');
        const uploadStream = fs.createReadStream(file.path);
        await uploadToR2(r2Key, uploadStream, {
          'content-hash': hash,
          'mime-type': file.mimetype || 'application/octet-stream',
        });
      } else {
        const fileBuffer = await fs.promises.readFile(file.path);
        hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        await uploadToR2(r2Key, fileBuffer, {
          'content-hash': hash,
          'mime-type': file.mimetype || 'application/octet-stream',
        });
      }

      uploaded.push({ path: relativePath, size: file.size, contentHash: hash });

      // Clean up temp file
      await fs.promises.unlink(file.path).catch(() => {});
    }

    return res.status(200).json({ ok: true, files: uploaded, ...(rejected.length ? { rejected } : {}) });
  } catch (err) {
    logger.error({ err }, 'Failed to upload centralized data');
    // Clean up any remaining temp files
    for (const file of files) {
      await fs.promises.unlink(file.path).catch(() => {});
    }
    return res.status(500).json({ ok: false, message: 'Upload to R2 failed' });
  }
};
