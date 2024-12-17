import { Request, Response, NextFunction } from 'express';

import { RequestWithUser } from '../../middleware/authorisation.js';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body;

  res.send({ ok: false });
};

export const check = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  if (req.user) {
    res.status(200).send({ ok: true });
    return;
  }

  res.status(401).send({ ok: false });
};
