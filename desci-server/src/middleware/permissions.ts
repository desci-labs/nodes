import { User } from '@prisma/client';
import { NextFunction, Request as ExpressRequest, Response } from 'express';
import jwt from 'jsonwebtoken';

import { logger } from '../logger.js';
import { getUserByEmail, getUserByOrcId } from '../services/user.js';

export const ensureUser = async (req: ExpressRequest, res: Response, next: NextFunction) => {
  const token = await extractAuthToken(req);
  const retrievedUser = await extractUserFromToken(token);
  if (!retrievedUser) {
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }
  (req as any).user = retrievedUser;
  next();
};

/**
 * Extract JWT Authorisation token from IncommingRequest
 */
export const extractAuthToken = async (request: ExpressRequest | Request) => {
  let token: string | undefined;
  // Try to retrieve the token from the auth header
  const authHeader = request.headers['authorization'];
  if (authHeader) {
    token = authHeader.split(' ')[1];
  }
  logger.info({ module: 'Permissions::extractAuthToken', authHeader }, 'Request');

  // If auth token wasn't found in the header, try retrieve from cookies
  if (!token && request['cookies']) {
    token = request['cookies']['auth'];
  }

  // If Auth token is null and request.headers.cookie is valid, attempt to parse auth token from cookie
  // Request.Headers.Cookie is of the format `auth=tokenvalue; path=/`
  if (!token && request.headers['cookie']) {
    const parsedTokenValue = request.headers['cookie']
      .split(';')
      .map((entry) => entry.split('='))
      .filter(([key]) => key.trim().toLowerCase() === 'auth')[0];
    token = parsedTokenValue?.[1];
    // console.log('parsedTokenValue', parsedTokenValue);
  }

  return token;
};

/**
 * Attempt to retrieve user from JWT Authorisation token
 */
export const extractUserFromToken = async (token: string): Promise<User | null> => {
  return new Promise(async (resolve, _) => {
    if (!token) {
      resolve(null);
      return;
    }

    jwt.verify(token, process.env.JWT_SECRET as string, async (err: any, user: any) => {
      if (err) {
        logger.info({ module: 'ExtractAuthUser', token }, 'anon request');
        resolve(null);
        return;
      }

      logger.info({ module: 'ExtractAuthUser', user }, 'User decrypted');

      if (!user) {
        resolve(null);
        return;
      }

      const loggedInUserEmail = user.email as string;
      const shouldFetchUserByOrcId = Boolean(user.orcid);

      const retrievedUser = shouldFetchUserByOrcId
        ? await getUserByOrcId(user.orcid)
        : await getUserByEmail(loggedInUserEmail);

      logger.info({ user: retrievedUser.id }, 'User Retrieved');

      if (!retrievedUser || !retrievedUser.id) {
        resolve(null);
        return;
      }

      resolve(retrievedUser);
    });
  });
};
