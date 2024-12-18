import { Response, NextFunction } from 'express';
import _ from 'lodash';
import z from 'zod';

import { prisma } from '../../client.js';
import { NotFoundError } from '../../core/ApiError.js';
import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { getCommentsSchema } from '../../routes/v1/attestations/schema.js';
import { attestationService } from '../../services/Attestation.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

export const getGeneralComments = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { uuid } = req.params as z.infer<typeof getCommentsSchema>['params'];
  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  if (!node) throw new NotFoundError("Can't comment on unknown research object");

  const restrictVisibility = node.ownerId !== req?.user?.id;

  logger.info({ restrictVisibility }, 'Query Comments');
  const comments = await attestationService.getComments({
    uuid: ensureUuidEndsWithDot(uuid),
    ...(restrictVisibility && { visible: true }),
  });

  const data = comments.map((comment) => {
    const author = _.pick(comment.author, ['id', 'name', 'orcid']);
    return { ...comment, author, highlights: comment.highlights.map((h) => JSON.parse(h as string)) };
  });

  return new SuccessResponse(data).send(res);
};
