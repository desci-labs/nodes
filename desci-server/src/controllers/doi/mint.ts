import { DoiStatus } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import _ from 'lodash';

import { MintError } from '../../core/doi/error.js';
import {
  BadRequestError,
  NotFoundError,
  SuccessMessageResponse,
  SuccessResponse,
  crossRefClient,
  doiService,
  ensureUuidEndsWithDot,
  logger as parentLogger,
  prisma,
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
  res: Response,
  _next: NextFunction,
) => {
  const logger = parentLogger.child({ module: 'handleCrossrefNotificationCallback' });

  const submission = await doiService.getPendingSubmission(req.payload.externalId);
  logger.info({ submission }, 'SUBMISSION');

  if (!submission) {
    logger.error({ payload: req.payload }, 'Crossref Notifiication: pending submission not found');
    // throw new NotFoundError('submission not found');
    new SuccessMessageResponse().send(res);
    return;
  }

  await doiService.updateSubmission({ id: submission.id }, { notification: req.payload });
  logger.info('SUBMISSION UPDATED');

  new SuccessMessageResponse().send(res);

  try {
    // check retrieve url to get submission result
    const response = await crossRefClient.retrieveSubmission(req.payload.retrieveUrl);

    logger.info({ response, submission }, 'CREATE DOI CALLBACK RESPONSE');
    if (response.success) {
      logger.info({ response, submission }, 'CREATE DOI ');

      const doiRecord = await prisma.doiRecord.create({
        data: {
          uuid: submission.uuid,
          dpid: submission.dpid,
          doi: submission.uniqueDoi,
        },
      });
      await doiService.updateSubmission(
        { id: submission.id },
        {
          status: DoiStatus.SUCCESS,
          doiRecordId: doiRecord.id,
        },
      );
    } else {
      logger.info('ERROR CREATING DOI');
      await doiService.updateSubmission(
        { id: submission.id },
        { status: response.failure ? DoiStatus.FAILED : DoiStatus.PENDING },
      );
    }

    // TODO: email authors about the submission status
  } catch (error) {
    logger.error({ error }, 'Error updating DOI submission');
  }
};
