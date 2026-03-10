import { Request, Response } from 'express';
import path from 'path';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { getStreamFromR2, isR2Configured } from '../../services/r2.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

const logger = parentLogger.child({ module: 'DATA::DownloadCentralized' });

export const downloadCentralized = async (req: Request, res: Response): Promise<void> => {
  const nodeUuid = req.params.nodeUuid;
  const filePath = req.params[0]; // wildcard param
  const shareId = req.query.shareId as string | undefined;
  const user = (req as any).user;

  if (!isR2Configured) {
    res.status(503).send({ ok: false, message: 'R2 storage is not configured' });
    return;
  }

  if (!nodeUuid || !filePath) {
    res.status(400).json({ ok: false, message: 'Missing node UUID or file path' });
    return;
  }

  const normalizedUuid = ensureUuidEndsWithDot(nodeUuid);

  logger.info({ nodeUuid: normalizedUuid, filePath, hasShareId: !!shareId, hasUser: !!user }, 'Download request');

  // Access check: must have valid shareId OR be the node owner
  let hasAccess = false;

  if (shareId) {
    const privateShare = await prisma.privateShare.findFirst({
      where: { shareId },
      select: { node: true, nodeUUID: true },
    });

    if (privateShare && privateShare.node && ensureUuidEndsWithDot(privateShare.nodeUUID) === normalizedUuid) {
      hasAccess = true;
    }
  }

  if (!hasAccess && user) {
    const node = await prisma.node.findFirst({
      where: { uuid: normalizedUuid, ownerId: user.id },
    });
    if (node) {
      hasAccess = true;
    }
  }

  if (!hasAccess) {
    res.status(403).json({ ok: false, message: 'Access denied. Provide a valid shareId or authenticate as the node owner.' });
    return;
  }

  try {
    const r2Key = `${normalizedUuid}/${filePath}`;
    const { stream, metadata } = await getStreamFromR2(r2Key);

    const mimeType = metadata['mime-type'] || 'application/octet-stream';
    const contentHash = metadata['content-hash'];
    const fileName = path.basename(filePath);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    if (contentHash) {
      res.setHeader('X-Content-Hash', contentHash);
    }

    stream.pipe(res);
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ ok: false, message: 'File not found' });
      return;
    }
    logger.error({ err }, 'Failed to download from R2');
    res.status(500).json({ ok: false, message: 'Download failed' });
  }
};
