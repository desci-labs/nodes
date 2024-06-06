import { Request, Response, NextFunction } from 'express';

import { BadRequestError, SuccessResponse, doiService, ensureUuidEndsWithDot } from '../../internal.js';

export const mintDoi = async (req: Request, res: Response, next: NextFunction) => {
  const { uuid } = req.params;
  if (!uuid) throw new BadRequestError();
  const sanitizedUuid = ensureUuidEndsWithDot(uuid);
  const doi = await doiService.mintDoi(sanitizedUuid);
  new SuccessResponse(doi).send(res);
};
