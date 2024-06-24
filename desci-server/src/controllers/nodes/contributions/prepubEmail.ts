import type { Request, Response } from 'express';

import { prisma } from '../../../client.js';
import { logger as parentLogger } from '../../../logger.js';
import { publishServices } from '../../../services/PublishServices.js';
import { CidString } from '../../../services/Thumbnails.js';
import { ensureUuidEndsWithDot } from '../../../utils.js';

export type EmailPublishPackageReqBodyParams = {
  prepubDistPdfCid: CidString;
  nodeUuid: string;
};

type EmailPublishPackageResponse = {
  ok: true;
};

type EmailPublishPackageErrorResponse = {
  ok: false;
  error: string;
  status?: number;
};

/**
 * Generates a prepublish package for a published node (at the moment just the distro PDF)
 */
export const emailPublishPackage = async (
  req: Request<{ emailAllContributors?: boolean }, any, EmailPublishPackageReqBodyParams>,
  res: Response<EmailPublishPackageResponse | EmailPublishPackageErrorResponse>,
) => {
  const { prepubDistPdfCid, nodeUuid } = req.body;
  const { emailAllContributors } = req.query;
  const logger = parentLogger.child({
    module: 'NODES::emailPublishPackageController',
    prepubDistPdfCid,
    emailAllContributors,
    nodeUuid,
  });
  // debugger;
  logger.trace({ fn: 'Distributing Publish Package' });

  if (!nodeUuid) return res.status(400).json({ ok: false, error: 'nodeUuid is required.' });
  if (!prepubDistPdfCid) return res.status(400).json({ ok: false, error: 'pdfCid is required.' });

  try {
    const node = await prisma.node.findFirst({
      where: {
        uuid: ensureUuidEndsWithDot(nodeUuid),
      },
    });

    if (!node) return res.status(404).json({ ok: false, error: 'Node not found' });

    const distPdfEntry = await prisma.distributionPdfs.findFirst({
      where: { distPdfCid: prepubDistPdfCid, nodeUuid: node.uuid },
    });
    if (!distPdfEntry) return res.status(404).json({ ok: false, error: 'Distribution PDF not found' });

    // Fire off email
    await publishServices.sendVersionUpdateEmailToAllContributors({
      node,
      manuscriptCid: prepubDistPdfCid,
      ownerOnly: !emailAllContributors,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    logger.error({ error: e.message });
    return res.status(500).json({ ok: false, error: 'Failed sending distribution package email' });
  }
};
