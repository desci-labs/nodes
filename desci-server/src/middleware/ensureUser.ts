import { User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { extractAuthToken, extractUserFromToken } from './permissions.js';

// export const ensureUser = async (req: Request, res: Response, next: NextFunction) => {
//   const retrievedUser = await retrieveUser(req);
//   if (!retrievedUser) {
//     res.status(401).send({ ok: false, message: 'Unauthorized' });
//     return;
//   }
//   (req as any).user = retrievedUser;
//   next();
// };

/**
 * Attaches the user to the request (req.user), the difference between this middleware and ensureUser is that this is optional
 * and won't reject with a 401 if not logged in.
 */
export const attachUser = async (req: Request, res: Response, next: NextFunction) => {
  const retrievedUser = await retrieveUser(req);
  (req as any).user = retrievedUser;
  next();
};

export const retrieveUser = async (req: Request): Promise<User | null> => {
  const token = await extractAuthToken(req);
  const retrievedUser = await extractUserFromToken(token);
  return retrievedUser;
};
