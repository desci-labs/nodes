import { NextFunction, Request, Response } from 'express';

import { DoiError } from '../../core/doi/error.js';
import {
  BadRequestError,
  RequestWithNode,
  SuccessResponse,
  doiService,
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

export const getDoi = async (req: Request, res: Response, next: NextFunction) => {
  const { identifier } = req.params;
  if (!identifier) throw new BadRequestError();

  const doi = await doiService.getDoiByDpidOrUuid(identifier);
  new SuccessResponse(doi).send(res);
};
