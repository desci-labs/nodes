import type { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { getManifestByCid } from '../../services/data/processing.js';
import { publishPackageService } from '../../services/PublishPackage.js';
import { CidString } from '../../services/Thumbnails.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

export type PreparePublishPackageReqBodyParams = {
  manifestCid: string;
  pdfCid: string;
  doi: string; // temp till DOI system is operational
  dpid: string;
  nodeUuid: string;
  codeAvailableDpid?: string;
  dataAvailableDpid?: string;
};

type PreparePublishPackageResponse = {
  ok: true;
  distPdfCid: CidString;
};

type PreparePublishPackageErrorResponse = {
  ok: false;
  error: string;
  status?: number;
};

/**
 * Generates a prepublish package for a published node (at the moment just the distro PDF)
 */
export const preparePublishPackage = async (
  req: Request<any, any, PreparePublishPackageReqBodyParams>,
  res: Response<PreparePublishPackageResponse | PreparePublishPackageErrorResponse>,
) => {
  const { pdfCid, doi, nodeUuid, codeAvailableDpid, dataAvailableDpid, manifestCid } = req.body;
  const logger = parentLogger.child({
    module: 'NODES::PreparePublishPackageController',
    pdfCid,
    doi,
    nodeUuid,
    codeAvailableDpid,
    dataAvailableDpid,
  });
  debugger;
  logger.trace({ fn: 'Retrieving Publish Package' });

  if (!nodeUuid) return res.status(400).json({ ok: false, error: 'nodeUuid is required.' });
  if (!doi) return res.status(400).json({ ok: false, error: 'doi is required.' });
  if (!pdfCid) return res.status(400).json({ ok: false, error: 'pdfCid is required.' });
  if (!manifestCid) return res.status(400).json({ ok: false, error: 'manifestCid is required.' });

  try {
    const node = await prisma.node.findFirst({
      where: {
        uuid: ensureUuidEndsWithDot(nodeUuid),
      },
    });

    if (!node) return res.status(404).json({ ok: false, error: 'Node not found' });

    const manifest = await getManifestByCid(manifestCid);

    // debugger;
    const { pdfCid: distPdfCid } = await publishPackageService.prepareDistributionPdf({
      pdfCid,
      codeAvailableDpid,
      dataAvailableDpid,
      node,
      doi,
      manifest,
      manifestCid,
    });

    return res.status(200).json({ ok: true, distPdfCid });
  } catch (e) {
    logger.error({ fn: 'preparePublishPackage', error: e.message });
    return res.status(500).json({ ok: false, error: 'Failed preparing distribution package' });
  }
};
