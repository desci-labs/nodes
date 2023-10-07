import { Request, Response, NextFunction } from 'express';

const disableList = ['noreply+test@desci.com'];

export const ensureAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;

  if (user.email.indexOf('@desci.com') > -1 && disableList.indexOf(user.email) < 0) {
    next();
    return;
  }

  res.sendStatus(401);
};
