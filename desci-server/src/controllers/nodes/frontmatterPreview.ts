import type { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { publishPackageService } from '../../services/PublishPackage.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

type FrontmatterPreviewQueryParams = {
  contentPageOnly?: boolean;
};

type FrontmatterPreviewReqBodyParams = {
  uuid: string;
  pdfCid: string;
};

type FrontmatterPreviewResponse = {
  ok: true;
  frontmatterPageCid: string;
  contentPageCid: string;
};

type FrontmatterPreviewErrorResponse = {
  ok: false;
  error: string;
  status?: number;
};

/**
 * Generates previews for the frontmatter and first content page of a PDF
 * @param req.params.contentPageOnly will only generate the first content page preview (Used before frontmatter is generated)
 */
export const frontmatterPreview = async (
  req: Request<FrontmatterPreviewQueryParams, any, FrontmatterPreviewReqBodyParams>,
  res: Response<FrontmatterPreviewResponse | FrontmatterPreviewErrorResponse>,
) => {
  const user = (req as any).user;
  const { uuid, pdfCid } = req.body;
  const { contentPageOnly } = req.params;
  const logger = parentLogger.child({
    module: 'NODES::FrontmatterPreview',
    uuid,
    contentPageOnly,
    userId: user?.id,
  });
  logger.trace({ fn: 'Retrieving frontmatter previews' });

  if (!uuid) return res.status(400).json({ ok: false, error: 'UUID is required.' });
  if (!pdfCid) return res.status(400).json({ ok: false, error: 'pdfCid is required.' });

  if (user) {
    // Check if user owns node, if requesting previews
    const node = await prisma.node.findFirst({
      where: {
        ownerId: user.id,
        uuid: ensureUuidEndsWithDot(uuid),
      },
    });

    if (!node) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  debugger;
  const previewMap = await publishPackageService.generatePdfPreview(pdfCid, 1000, [1, 2], ensureUuidEndsWithDot(uuid));
  // debugger;
  return res.status(200).json({ ok: true, frontmatterPageCid: previewMap[1], contentPageCid: previewMap[2] });
};
