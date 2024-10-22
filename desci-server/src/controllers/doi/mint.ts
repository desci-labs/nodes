import { DoiStatus } from '@prisma/client';
import sgMail from '@sendgrid/mail';
import { Request, Response, NextFunction } from 'express';
import _ from 'lodash';

import { prisma } from '../../client.js';
import { BadRequestError } from '../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { MintError } from '../../core/doi/error.js';
import { logger as parentLogger } from '../../logger.js';
import { getTargetDpidUrl } from '../../services/fixDpid.js';
import { crossRefClient, doiService } from '../../services/index.js';
import { DoiMintedEmailHtml } from '../../templates/emails/utils/emailRenderer.js';
import { discordNotify, DiscordNotifyType } from '../../utils/discordUtils.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

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

    const targetDpidUrl = getTargetDpidUrl();
    discordNotify({
      type: DiscordNotifyType.INFO,
      title: 'Mint DOI',
      message: `${targetDpidUrl}/${submission.dpid} sent a request to mint: ${submission.uniqueDoi}`,
    });
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

  // if (submission.status === DoiStatus.SUCCESS) {
  //   logger.trace({ payload: req.payload }, 'Crossref Notifiication: submission ');
  //   new SuccessMessageResponse().send(res);
  //   return;
  // }

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
      const message = {
        to: node.owner.email,
        from: 'no-reply@desci.com',
        subject: 'DOI Registration successful 🎉',
        text: `Hello ${node.owner.name}, You DOI registration for the research object ${node.title} has been completed. Here is your DOI: ${process.env.CROSSREF_DOI_URL}/${submission.uniqueDoi}`,
        html: DoiMintedEmailHtml({
          dpid: submission.dpid,
          userName: node.owner.name.split(' ')?.[0] ?? '',
          dpidPath: `${process.env.DAPP_URL}/dpid/${submission.dpid}`,
          doi: `${process.env.CROSSREF_DOI_URL}/${submission.uniqueDoi}`,
          nodeTitle: node.title,
        }),
      };

      try {
        logger.info({ members: message, NODE_ENV: process.env.NODE_ENV }, 'DOI MINTED EMAIL');
        if (process.env.NODE_ENV === 'production') {
          const response = await sgMail.send(message);
          logger.info(response, '[EMAIL]:: Response');
        } else {
          logger.info({ nodeEnv: process.env.NODE_ENV }, message.subject);
        }
      } catch (err) {
        logger.info({ err }, '[ERROR]:: DOI MINTED EMAIL');
      }
    } else {
      logger.info('ERROR CREATING DOI');
      await doiService.updateSubmission(
        { id: submission.id },
        { status: response.failure ? DoiStatus.FAILED : DoiStatus.PENDING },
      );

      // send discord notification
      discordNotify({
        type: DiscordNotifyType.SUCCESS,
        title: 'DOI Registration Inconclusive ❌',
        message: `Check ${req.payload.retrieveUrl} for more details. Node: ${targetDpidUrl}/${submission.dpid}`,
      });
    }
  } catch (error) {
    logger.error({ error }, 'Error updating DOI submission');
  }
};
