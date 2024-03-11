import { User } from '@prisma/client';
import { NextFunction, Request as ExpressRequest, Response } from 'express';
import jwt from 'jsonwebtoken';

import { prisma } from '../client.js';
import { hashApiKey } from '../controllers/auth/utils.js';
import { logger } from '../logger.js';
import { getUserByEmail, getUserByOrcId } from '../services/user.js';

export enum AuthMethods {
  AUTH_TOKEN = 'AUTH_TOKEN',
  API_KEY = 'API_KEY',
}

export const ensureUser = async (req: ExpressRequest, res: Response, next: NextFunction) => {
  // debugger;
  const token = await extractAuthToken(req);
  const apiKey = await extractApiKey(req);
  const authTokenRetrieval = await extractUserFromToken(token);
  const apiKeyRetrieval = await extractUserFromApiKey(apiKey, req.ip);

  const retrievedUser = authTokenRetrieval || apiKeyRetrieval;

  if (!retrievedUser) {
    res.status(401).send({ ok: false, message: 'Unauthorized' });
  } else {
    (req as any).user = retrievedUser;
    (req as any).authMethod = authTokenRetrieval ? AuthMethods.AUTH_TOKEN : AuthMethods.API_KEY;
    next();
  }
};

/**
 * Extract JWT Authorisation token from IncommingRequest
 */
export const extractAuthToken = async (request: ExpressRequest | Request) => {
  const token = await extractTokenFromCookie(request, 'auth');
  return token;
};

/**
 * Extract Any token from IncommingRequest (Auth Bearer or Cookie or Cookies)
 */
export const extractTokenFromCookie = async (request: ExpressRequest | Request, tokenName: string) => {
  let token: string | undefined;
  // get from query string
  token = request.url.split(`${tokenName}=`)[1];
  logger.info({ url: request.url, token }, 'got url extract');
  if (!token) {
    // Try to retrieve the token from the header
    const authHeader = request.headers['authorization'];
    if (authHeader) {
      token = authHeader.split(' ')[1];
    }
    logger.info({ module: 'Permissions::extractToken', authHeaderLength: authHeader?.length || 0, token }, 'Request');

    // Sanitize null or undefined string tokens passed from frontend
    if (token === 'null' || 'undefined') token = null;

    // If auth token wasn't found in the header, try retrieve from cookies
    if (!token && request['cookies']) {
      token = request['cookies'][tokenName];
    }

    // If token is null and request.headers.cookie is valid, attempt to parse auth token from cookie
    // Request.Headers.Cookie is of the format `auth=tokenvalue; path=/`
    if (!token && request.headers['cookie']) {
      const parsedTokenValue = request.headers['cookie']
        .split(';')
        .map((entry) => entry.split('='))
        .filter(([key]) => key.trim().toLowerCase() === tokenName)[0];
      logger.info({ parsedTokenValue, cookie: request.headers['cookie'] }, 'COOKIE');
      token = parsedTokenValue?.[1];
      // console.log('parsedTokenValue', parsedTokenValue);
    }
    logger.info({ cookie: request.headers['cookie'] }, 'COOKIE');
  }
  return token;
};

/**
 * Attempt to retrieve user from JWT Authorisation token
 */
export const extractUserFromToken = async (token: string): Promise<User | null> => {
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

/**
 * Extract API Key from IncommingRequest
 */
export const extractApiKey = async (request: ExpressRequest | Request) => {
  const apiKeyHeader = request.headers['api-key'];
  return apiKeyHeader;
};

/**
 * Attempt to retrieve user via API key
 */
export const extractUserFromApiKey = (apiKey: string, ip: string): Promise<User | null> => {
  return new Promise(async (resolve, reject) => {
    if (!apiKey) {
      resolve(null);
      return;
    }

    const hashedApiKey = hashApiKey(apiKey);

    const validKey = await prisma.apiKey.findFirst({
      where: {
        keyHashed: hashedApiKey,
        isActive: true,
      },
      include: { user: true },
    });

    if (!validKey) {
      resolve(null);
      return;
    }

    logger.trace(
      { module: 'Permissions::extractUserFromApiKey', memo: validKey.memo },
      'User authenticated via API Key',
    );

    // Bump last used data
    await prisma.apiKey.update({
      where: {
        id: validKey.id,
      },
      data: {
        lastUsedIp: ip,
      },
    });

    const { user } = validKey;

    const loggedInUserEmail = user.email as string;
    const shouldFetchUserByOrcId = Boolean(user.orcid);

    const retrievedUser = shouldFetchUserByOrcId
      ? await getUserByOrcId(user.orcid)
      : await getUserByEmail(loggedInUserEmail);

    if (!retrievedUser || !retrievedUser.id) {
      resolve(null);
      return;
    }

    resolve(retrievedUser);
  });
};
