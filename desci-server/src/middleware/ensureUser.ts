import { User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import prisma from 'client';
import logger from 'logger';
import { getUserByEmail, getUserByOrcId } from 'services/user';
import { CustomError } from 'utils/response/custom-error/CustomError';

import { RequestWithUser } from './nodeGuard';

export const ensureUser = async (req: Request, res: Response, next: NextFunction) => {
  const retrievedUser = await retrieveUser(req);

  if (!(retrievedUser && retrievedUser.id > 0)) {
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }
  (req as RequestWithUser).user = retrievedUser;
  next();
};

export const retrieveUser = async (req: Request): Promise<User> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  return new Promise(async (success, fail) => {
    if (token == null) {
      success(null);
      return null;
    }
    jwt.verify(token, process.env.JWT_SECRET as string, async (err: any, user: any) => {
      if (err) {
        // anonymous user
        logger.info({ module: 'retrieveUserMiddleware', authHeader, token }, 'anon request');
        // console.log(err);
      }

      if (err) {
        success(null);
        return null;
      }
      if (!user) {
        success(null);
        return null;
      }

      const loggedInUserEmail = user.email as string;
      const shouldFetchUserByOrcId = Boolean(user.orcid);

      const retrievedUser = shouldFetchUserByOrcId
        ? await getUserByOrcId(user.orcid)
        : await getUserByEmail(loggedInUserEmail);

      if (!retrievedUser || !retrievedUser.id) {
        success(null);
        return null;
      }

      success(retrievedUser);
    });
  });
};
