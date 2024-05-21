import { Request, Response } from 'express';

import { BadRequestError, SuccessMessageResponse, SuccessResponse, doiService } from '../../internal.js';

export const checkMintability = async (req: Request, res: Response) => {
  const { uuid } = req.params;
  if (!uuid) throw new BadRequestError();
  await doiService.checkMintability(uuid);
  new SuccessMessageResponse().send(res);
};

export const getDoi = async (req: Request, res: Response) => {
  const { identifier } = req.params;
  if (!identifier) throw new BadRequestError();

  const doi = await doiService.getDoiByDpidOrUuid(identifier);
  new SuccessResponse(doi).send(res);
};
