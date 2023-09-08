import { User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import prisma from 'client';
import logger from 'logger';
import { getUserByEmail, getUserByOrcId } from 'services/user';

export const ensureUser = async (req: Request, res: Response, next: NextFunction) => {
  debugger;
  const retrievedUser = await retrieveUser(req);
  if (!retrievedUser) {
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }
  (req as any).user = retrievedUser;
  next();
};

export const retrieveUser = async (req: Request): Promise<User | null> => {
  let token: string | undefined;
  // debugger;
  // Try to retrieve the token from the auth header
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    token = authHeader.split(' ')[1];
  }

  // If auth token wasn't found in the header, try retrieve from cookies
  if (!token && req.cookies) {
    token = req.cookies['auth'];
  }

  return new Promise(async (success, fail) => {
    if (!token) {
      success(null);
      return;
    }

    jwt.verify(token, process.env.JWT_SECRET as string, async (err: any, user: any) => {
      if (err) {
        // anonymous user
        logger.info({ module: 'retrieveUserMiddleware', authHeader, token }, 'anon request');
        success(null);
        return;
      }

      if (!user) {
        success(null);
        return;
      }

      const loggedInUserEmail = user.email as string;
      const shouldFetchUserByOrcId = Boolean(user.orcid);

      const retrievedUser = shouldFetchUserByOrcId
        ? await getUserByOrcId(user.orcid)
        : await getUserByEmail(loggedInUserEmail);

      if (!retrievedUser || !retrievedUser.id) {
        success(null);
        return;
      }

      success(retrievedUser);
    });
  });
};
