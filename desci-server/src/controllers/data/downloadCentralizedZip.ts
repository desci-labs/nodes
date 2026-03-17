import { Request, Response } from 'express';
import archiver from 'archiver';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { checkCentralizedDataAccess } from '../../services/centralizedDataAccess.js';
import { getStreamFromR2, listR2Objects, isR2Configured } from '../../services/r2.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

const logger = parentLogger.child({ module: 'DATA::DownloadCentralizedZip' });

export const downloadCentralizedZip = async (req: Request, res: Response): Promise<void> => {
  const nodeUuid = req.params.nodeUuid;
  const shareId = req.query.shareId as string | undefined;
  const user = (req as any).user;

  if (!isR2Configured) {
    res.status(503).send({ ok: false, message: 'R2 storage is not configured' });
    return;
  }

  if (!nodeUuid) {
    res.status(400).json({ ok: false, message: 'Missing node UUID' });
    return;
  }

  const normalizedUuid = ensureUuidEndsWithDot(nodeUuid);

  const { hasAccess } = await checkCentralizedDataAccess(normalizedUuid, shareId, user);

  if (!hasAccess) {
    res.status(403).json({ ok: false, message: 'Access denied. Provide a valid shareId, authenticate as the node owner, or request a data grant.' });
    return;
  }

  try {
    const prefix = `${normalizedUuid}/`;
    const objects = await listR2Objects(prefix);

    if (objects.length === 0) {
      res.status(404).json({ ok: false, message: 'No files found for this node' });
      return;
    }

    const nodeRecord = await prisma.node.findFirst({ where: { uuid: normalizedUuid }, select: { title: true } });
    const zipName = (nodeRecord?.title || nodeUuid).replace(/[^a-zA-Z0-9_\- ]/g, '_') + '.zip';

    const sanitizedZipName = zipName
      .replace(/[\x00-\x1f\x7f"\\]/g, '_')
      .replace(/[^\x20-\x7e]/g, '_')
      || 'download.zip';
    const encodedZipName = encodeURIComponent(zipName).replace(/'/g, '%27');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedZipName}"; filename*=UTF-8''${encodedZipName}`);

    const archive = archiver('zip', { zlib: { level: 5 } });

    archive.on('error', (err) => {
      logger.error({ err }, 'Archive creation failed');
      if (!res.headersSent) {
        res.status(500).json({ ok: false, message: 'Failed to create archive' });
      }
    });

    archive.pipe(res);

    for (const obj of objects) {
      const relativePath = obj.key.slice(prefix.length);
      if (!relativePath) continue;

      try {
        const { stream } = await getStreamFromR2(obj.key);
        archive.append(stream, { name: relativePath });
      } catch (err) {
        logger.warn({ err, key: obj.key }, 'Skipping file in zip — failed to read from R2');
      }
    }

    await archive.finalize();

    logger.info({ nodeUuid: normalizedUuid, fileCount: objects.length }, 'Zip download completed');
  } catch (err) {
    logger.error({ err }, 'Failed to create zip download');
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: 'Download failed' });
    }
  }
};
