import { DoiStatus } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import _ from 'lodash';

import { prisma } from '../../client.js';
// import { BadRequestError } from '../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
// import { MintError } from '../../core/doi/error.js';
import { logger as parentLogger } from '../../logger.js';
import { EmailTypes, sendEmail } from '../../services/email.js';
import { getTargetDpidUrl } from '../../services/fixDpid.js';
import { crossRefClient, doiService } from '../../services/index.js';
import { DiscordChannel, discordNotify, DiscordNotifyType } from '../../utils/discordUtils.js';
// import { ensureUuidEndsWithDot } from '../../utils.js';

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

  const targetDpidUrl = getTargetDpidUrl();

  try {
    // check retrieve url to get submission result
    const response = await crossRefClient.retrieveSubmission(req.payload.retrieveUrl);

    logger.info({ response, submission }, 'CREATE DOI CALLBACK RESPONSE');
    if (response.success) {
      logger.info({ response, submission }, 'CREATE DOI ');

      await doiService.onRegistrationSuccessful(submission);

      // send discord notification
      discordNotify({
        channel: DiscordChannel.DoiMinting,
        type: DiscordNotifyType.SUCCESS,
        title: 'DOI Registration successful 🎉',
        message: `${targetDpidUrl}/${submission.dpid} was assigned a DOI: ${submission.uniqueDoi}`,
      });

      // Send Notification Email Node author about the submission status
      const node = await prisma.node.findFirst({
        where: { uuid: submission.uuid },
        include: { owner: { select: { email: true, name: true } } },
      });

      if (!node.owner.email) return;
      sendEmail({
        type: EmailTypes.DoiMinted,
        payload: {
          name: node.owner.name,
          doi: submission.uniqueDoi,
          dpid: submission.dpid,
          to: node.owner.email,
          title: node.title,
        },
      });
    } else {
      logger.info('ERROR CREATING DOI');
      await doiService.updateSubmission(
        { id: submission.id },
        { status: response.failure ? DoiStatus.FAILED : DoiStatus.PENDING },
      );

      // send discord notification
      discordNotify({
        channel: DiscordChannel.DoiMinting,
        type: DiscordNotifyType.ERROR,
        title: 'DOI Registration Inconclusive ❌',
        message: `Check ${req.payload.retrieveUrl} for more details. Node: ${targetDpidUrl}/${submission.dpid}`,
      });
    }
  } catch (error) {
    logger.error({ error }, 'Error updating DOI submission');
  }
};
