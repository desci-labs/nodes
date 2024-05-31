import { Request, Response } from 'express';

import { DoiError } from '../../core/doi/error.js';
import { BadRequestError, SuccessResponse, doiService, logger } from '../../internal.js';

export const checkMintability = async (req: Request, res: Response) => {
  const { uuid } = req.params;
  if (!uuid) throw new BadRequestError();
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

export const getDoi = async (req: Request, res: Response) => {
  const { identifier } = req.params;
  if (!identifier) throw new BadRequestError();

  const doi = await doiService.getDoiByDpidOrUuid(identifier);
  new SuccessResponse(doi).send(res);
};
