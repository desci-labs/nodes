import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { DoiError } from '../../core/doi/error.js';
import {
  BadRequestError,
  RequestWithNode,
  SuccessResponse,
  doiService,
  ensureUuidEndsWithDot,
  logger,
  logger as parentLogger,
} from '../../internal.js';

export const checkMintability = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { uuid } = req.params;
  if (!uuid) throw new BadRequestError();

  const logger = parentLogger.child({
    module: 'DOI::checkMintability',
  });

  try {
    await doiService.checkMintability(uuid);
    new SuccessResponse(true).send(res);
  } catch (err) {
    logger.error(err, 'module:: checkMintability');
    if (!(err instanceof DoiError)) {
      // TODO: Sentry error reporting
    }
    new SuccessResponse(false).send(res);
  }
};

export const getDoi = async (req: Request, res: Response, _next: NextFunction) => {
  const { doi: doiQuery, uuid, dpid } = req.query;
  const identifier = doiQuery || uuid || dpid;

  if (!identifier) throw new BadRequestError();

  if (uuid) {
    const pending = await doiService.hasPendingSubmission(ensureUuidEndsWithDot(uuid as string));
    logger.info({ pending }, 'GET DOI');
    if (pending) {
      new SuccessResponse({ status: pending.status }).send(res);
      return;
    }
  }

  const doi = await doiService.findDoiRecord(identifier as string);
  const data = _.pick(doi, ['doi', 'dpid', 'uuid']);
  new SuccessResponse(data).send(res);
};
