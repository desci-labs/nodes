import { Request, Response, NextFunction } from 'express';

import { BadRequestError, SuccessMessageResponse, doiService } from '../../internal.js';

export const checkMintability = async (req: Request, res: Response, next: NextFunction) => {
  const { uuid } = req.params;
  if (!uuid) throw new BadRequestError();
  await doiService.checkMintability(uuid);
  new SuccessMessageResponse().send(res);
};
