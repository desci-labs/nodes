import { Readable } from 'stream';

import type { Request, Response } from 'express';

import { logger as parentLogger } from '../../logger.js';
import { thumbnailsService } from '../../services/Thumbnails.js';

const logger = parentLogger.child({
  module: 'NODES::EphemeralThumbnail',
});

type EphemeralThumbnailReqQuery = {
  height?: string;
};

type EphemeralThumbnailResponse = {
  ok: boolean;
  error?: string;
};

export const ephemeralThumbnail = async (
  req: Request<any, any, any, EphemeralThumbnailReqQuery>,
  res: Response<EphemeralThumbnailResponse>,
): Promise<void> => {
  const user = (req as any).user;
  const height = req.query.height ? parseInt(req.query.height) : undefined;

  logger.trace({ fn: 'Generating ephemeral thumbnail', userId: user?.id, height });

  if (!req.file) {
    logger.error('No file uploaded');
    res.status(400).json({ ok: false, error: 'No file uploaded.' });
    return;
  }

  try {
    const fileStream = Readable.from(req.file.buffer);
    const thumbnailStream = await thumbnailsService.generateThumbnailFromStream(
      fileStream,
      req.file.originalname,
      height,
    );

    res.setHeader('Content-Type', 'image/png');
    thumbnailStream.pipe(res);
  } catch (error) {
    logger.error('Error generating ephemeral thumbnail:', error);
    res.status(500).json({ ok: false, error: 'Error generating thumbnail' });
  }
};
