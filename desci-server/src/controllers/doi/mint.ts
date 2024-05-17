import { Request, Response, NextFunction } from 'express';

import { BadRequestError, SuccessResponse, doiService } from '../../internal.js';

export const mintDoi = async (req: Request, res: Response, next: NextFunction) => {
  const { uuid } = req.params;
  if (!uuid) throw new BadRequestError();
  const doi = await doiService.mintDoi(uuid);
  new SuccessResponse(doi).send(res);
};
