import { DoiStatus } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import _ from 'lodash';

import { MintError } from '../../core/doi/error.js';
import {
  BadRequestError,
  SuccessMessageResponse,
  SuccessResponse,
  crossRefClient,
  doiService,
  ensureUuidEndsWithDot,
  logger,
} from '../../internal.js';

export const mintDoi = async (req: Request, res: Response, _next: NextFunction) => {
  const { uuid } = req.params;
  if (!uuid) throw new BadRequestError();
  const sanitizedUuid = ensureUuidEndsWithDot(uuid);
  const isPending = await doiService.hasPendingSubmission(sanitizedUuid);
  if (isPending) {
    throw new MintError('You have a pending submission');
  } else {
    const submission = await doiService.mintDoi(sanitizedUuid);
    const data = _.pick(submission, ['id', 'status']);
    new SuccessResponse(data).send(res);
  }
};

export interface RequestWithCrossRefPayload extends Request {
  payload: {
    notifyEndpoint: string;
    externalId: string;
    internalId: string;
    retrieveUrl: string;
    serviceDate: string;
    retrieveUrlExpirationDate: string;
  };
}

export const handleCrossrefNotificationCallback = async (
  req: RequestWithCrossRefPayload,
  _res: Response,
  _next: NextFunction,
) => {
  const submission = await doiService.getPendingSubmission(req.payload.externalId);

  if (!submission) {
    logger.error({ payload: req.payload }, 'Crossref Notifiication: pending submission not found');
    return;
  }

  await doiService.updateSubmission({ id: submission.id }, { notification: req.payload });

  new SuccessMessageResponse();

  // check retrieve url to get submission result
  const response = await crossRefClient.retrieveSubmission(req.payload.retrieveUrl);
  await doiService.updateSubmission(
    { id: submission.id },
    { status: response.success ? DoiStatus.SUCCESS : response.failure ? DoiStatus.FAILED : DoiStatus.PENDING },
  );
};
