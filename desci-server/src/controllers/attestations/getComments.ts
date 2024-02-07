import { AnnotationType } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { SuccessResponse, attestationService } from '../../internal.js';

export const getAttestationComments = async (req: Request, res: Response, next: NextFunction) => {
  const { attestationId, attestationVersionId } = req.params;
  const comments = await attestationService.getAllClaimComments({
    nodeAttestationId: parseInt(attestationId),
    type: AnnotationType.COMMENT,
  });

  const data = comments
    .filter((comment) => comment.attestation.attestationVersionId === parseInt(attestationVersionId))
    .map((comment) => {
      const author = _.pick(comment.author, ['id', 'name', 'orcid']);
      return { ...comment, author };
    });

  return new SuccessResponse(data).send(res);
};
