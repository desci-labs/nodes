import { NextFunction, Request as ExpressRequest, Response } from 'express';
import jwt from 'jsonwebtoken';

import { logger as parentLogger } from '../logger.js';
import { getUserByEmail, getUserByOrcId } from '../services/user.js';

const logger = parentLogger.child({ module: 'MIDDLEWARE/PERMISSIONS' });

export const ensureUser = async (req: ExpressRequest, res: Response, next: NextFunction) => {
  const token = await extractAuthToken(req);

  if (!token) {
    logger.trace('Token not found');
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }

  const retrievedUser = await extractUserFromToken(token);
  if (!retrievedUser) {
    logger.trace('User not found');
    res.status(401).send({ ok: false, message: 'Unauthorized' });
  } else {
    (req as any).user = retrievedUser;
    next();
  }
};

const AUTH_COOKIE_DOMAIN_MAPPING = {
  'https://nodes-api.desci.com': 'auth',
  'https://nodes-api-dev.desci.com': 'auth-dev',
  'https://nodes-api-stage.desci.com': 'auth-stage',
};

// auth, auth-stage, auth-dev
export const AUTH_COOKIE_FIELDNAME =
  AUTH_COOKIE_DOMAIN_MAPPING[process.env.SERVER_URL || 'https://nodes-api.desci.com'] || 'auth';

/**
 * Extract JWT Authorisation token from IncommingRequest
 */
export const extractAuthToken = async (request: ExpressRequest | Request) => {
  let token: string | undefined;
  // get from query string
  token = request.url.split('auth=')[1];
  // logger.info({ url: request.url, token }, 'got url extract');
  if (!token) {
    // Try to retrieve the token from the auth header
    const authHeader = request.headers['authorization'];
    if (authHeader) {
      token = authHeader.split(' ')[1];
    }
    logger.trace({ module: 'Permissions::extractAuthToken', authHeaderLength: authHeader?.length || 0 }, 'Request');

    // If auth token wasn't found in the header, try retrieve from cookies
    if (!token && request['cookies']) {
      token = request['cookies'][AUTH_COOKIE_FIELDNAME];
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
  }
  return token;
};

/**
 * Attempt to retrieve user from JWT Authorisation token
 */
export const extractUserFromToken = async (token: string): Promise<any | null> => {
  return new Promise(async (resolve, reject) => {
    if (!token) {
      resolve(null);
      return;
    }

    jwt.verify(token, process.env.JWT_SECRET as string, async (err: any, user: any) => {
      if (err) {
        logger.error({ module: 'ExtractAuthUser', err }, 'anon request');
        // reject(err);
        resolve(null);
        return;
      }

      // logger.info({ module: 'ExtractAuthUser', user }, 'User decrypted');

      if (!user) {
        resolve(null);
        return;
      }

      const loggedInUserEmail = user.email as string;
      const shouldFetchUserByOrcId = Boolean(user.orcid);

      const retrievedUser = shouldFetchUserByOrcId
        ? await getUserByOrcId(user.orcid)
        : await getUserByEmail(loggedInUserEmail);

      // logger.info({ user: retrievedUser.id }, 'User Retrieved');

      if (!retrievedUser || !retrievedUser.id) {
        resolve(null);
        return;
      }

      resolve(retrievedUser);
    });
  });
};
