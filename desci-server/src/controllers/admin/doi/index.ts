import { NextFunction, Response } from 'express';
import { Request } from 'express';
import _ from 'lodash';

import { BadRequestError } from '../../../core/ApiError.js';
import { SuccessResponse } from '../../../core/ApiResponse.js';
import { MintError } from '../../../core/doi/error.js';
import { logger as parentLogger } from '../../../logger.js';
import { RequestWithUser } from '../../../middleware/authorisation.js';
import { getTargetDpidUrl } from '../../../services/fixDpid.js';
import { doiService } from '../../../services/index.js';
import { DiscordChannel, discordNotify, DiscordNotifyType } from '../../../utils/discordUtils.js';
import { ensureUuidEndsWithDot } from '../../../utils.js';

const logger = parentLogger.child({ module: 'ADMIN::DOI' });

export const listDoiRecords = async (_req: RequestWithUser, res: Response, _next: NextFunction) => {
  const data = await doiService.listDoi();
  logger.info({ data }, 'List DOIs');
  new SuccessResponse(data).send(res);
};

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
      channel: DiscordChannel.DoiMinting,
      type: DiscordNotifyType.INFO,
      title: 'Mint DOI',
      message: `${targetDpidUrl}/${submission.dpid} sent a request to mint: ${submission.uniqueDoi}`,
    });
  }
};
