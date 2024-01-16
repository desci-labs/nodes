import { Request, Response, NextFunction } from 'express';

import { retrieveUser } from './ensureUser.js';

export const ensureUserIfPresent = async (req: Request, res: Response, next: NextFunction) => {
  const retrievedUser = await retrieveUser(req);

  if (retrievedUser) {
    (req as any).user = retrievedUser;
  }

  next();
};
