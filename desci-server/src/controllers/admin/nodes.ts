import { Response } from 'express';
import { NextFunction } from 'http-proxy-middleware/dist/types.js';

import { prisma } from '../../client.js';
import { NotFoundError } from '../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode, RequestWithUser } from '../../middleware/authorisation.js';
import { redisClient } from '../../redisClient.js';
import { EXTERNAL_PUB_REDIS_KEY } from '../../services/crossRef/externalPublication.js';
import { searchExternalPublications } from '../../services/externalPublications.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import repoService from '../../services/repoService.js';
import { ensureUuidEndsWithDot } from '../../utils.js';
import { externalPublicationsSchema } from '../nodes/externalPublications.js';

const logger = parentLogger.child({ module: 'ADMIN::Nodes' });

export const getExternalPublications = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  logger.trace('[getExternalPublications]');
  //   const { uuid } = req.params as z.infer<typeof externalPublicationsSchema>['params'];
  //   const node = await prism.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  const node = req.node;
  if (!req.node) throw new NotFoundError(`Node ${node.uuid} not found`);

  const manifest = await repoService.getDraftManifest({
    uuid: node.uuid as NodeUuid,
    documentId: node.manifestDocumentId,
  });

  const response = await searchExternalPublications(manifest);

  new SuccessResponse(response).send(res);
};

export const clearExternalPubCache = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  logger.trace({ node: req.node.uuid, admin: req.user.id }, '[clearExternalPubCache]');
  const node = req.node;
  if (!req.node) throw new NotFoundError(`Node ${node.uuid} not found`);

  await redisClient.del(`${EXTERNAL_PUB_REDIS_KEY}-${node.uuid}`);
  await prisma.externalPublications.deleteMany({ where: { uuid: node.uuid } });

  return new SuccessMessageResponse().send(res);
};
