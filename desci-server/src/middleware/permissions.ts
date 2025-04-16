import { User } from '@prisma/client';
import { NextFunction, Request as ExpressRequest, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Socket, ExtendedError } from 'socket.io';

import { prisma } from '../client.js';
import { hashApiKey } from '../controllers/auth/utils.js';
import { logger } from '../logger.js';
import { getUserByEmail, getUserByOrcId } from '../services/user.js';
import { AUTH_COOKIE_FIELDNAME } from '../utils/sendCookie.js';

export enum AuthMethods {
  AUTH_TOKEN = 'AUTH_TOKEN',
  API_KEY = 'API_KEY',
}

export const ensureUser = async (req: ExpressRequest, res: Response, next: NextFunction) => {
  const token = await extractAuthToken(req);
  const apiKey = await extractApiKey(req);
  const authTokenRetrieval = await extractUserFromToken(token);
  const apiKeyRetrieval = await extractUserFromApiKey(apiKey, req.ip);
  const retrievedUser = authTokenRetrieval || apiKeyRetrieval;

  if (!retrievedUser) {
    res.status(401).send({ ok: false, message: 'Unauthorized' });
  } else if (retrievedUser.isGuest) {
    res.status(403).send({ ok: false, message: 'Registration required' });
  } else {
    (req as any).user = retrievedUser;
    (req as any).authMethod = authTokenRetrieval ? AuthMethods.AUTH_TOKEN : AuthMethods.API_KEY;
    next();
  }
};

export const ensureGuest = async (req: ExpressRequest, res: Response, next: NextFunction) => {
  const token = await extractAuthToken(req);
  const apiKey = await extractApiKey(req);
  const authTokenRetrieval = await extractUserFromToken(token);
  const apiKeyRetrieval = await extractUserFromApiKey(apiKey, req.ip);
  const retrievedUser = authTokenRetrieval || apiKeyRetrieval;
  if (!retrievedUser) {
    logger.trace({ token, apiKey }, 'ENSURE GUEST');
    res.status(401).send({ ok: false, message: 'Unauthorized' });
  } else if (!retrievedUser.isGuest) {
    logger.trace({ userId: retrievedUser.id }, 'Non-guest user attempted to access guest-only route');
    res.status(403).send({ ok: false, message: 'Guest users only' });
  } else {
    (req as any).user = retrievedUser;
    (req as any).authMethod = authTokenRetrieval ? AuthMethods.AUTH_TOKEN : AuthMethods.API_KEY;
    next();
  }
};

export const ensureGuestOrUser = async (req: ExpressRequest, res: Response, next: NextFunction) => {
  const token = await extractAuthToken(req);
  const apiKey = await extractApiKey(req);
  const authTokenRetrieval = await extractUserFromToken(token);
  const apiKeyRetrieval = await extractUserFromApiKey(apiKey, req.ip);
  const retrievedUser = authTokenRetrieval || apiKeyRetrieval;

  if (!retrievedUser) {
    logger.trace({ token, apiKey }, 'ENSURE GUEST OR USER');
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
  let token = await extractTokenFromCookie(request, AUTH_COOKIE_FIELDNAME);

  if (!token) {
    // Try to retrieve the token from the header
    const authHeader = request.headers['authorization'];
    if (authHeader) {
      token = authHeader.split(' ')[1];
    }
    logger.trace(
      {
        module: 'Permissions::extractToken',
        authHeaderLength: authHeader?.length || 0,
        authHeader,
        headers: request.headers,
      },
      'Request',
    );

    // Sanitize null or undefined string tokens passed from frontend
    if (token === 'null' || token === 'undefined') token = null;
  }

  return token;
};

export interface AuthenticatedSocket extends Socket {
  data: {
    userId: number | string;
  };
}

/**
 * Socket.IO WS: Authentication Middleware
 */
export const socketsEnsureUser = async (socket: Socket, next: (err?: ExtendedError) => void) => {
  // debugger;
  const cookies = parseWsCookies(socket.handshake.headers.cookie);
  if (!cookies) {
    return next(new Error('Authentication error: No cookies provided'));
  }
  const token = cookies[AUTH_COOKIE_FIELDNAME] as string | undefined;
  const ip =
    socket.handshake.headers['x-forwarded-for'] ||
    socket.handshake.address ||
    socket.handshake.headers['x-real-ip'] ||
    socket.conn.remoteAddress;

  logger.trace({ module: 'SocketEnsureUser Middleware', ip }, 'Attempting socketIO auth');

  if (!token) {
    logger.trace({ module: 'SocketEnsureUser Middleware', token, ip }, 'No token provided');
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const extractedUser = await extractUserFromToken(token);
    if (!extractedUser) {
      logger.trace({ module: 'SocketEnsureUser Middleware', ip }, 'Invalid token provided');
      return next(new Error('Authentication error: Invalid token provided'));
    }

    (socket as AuthenticatedSocket).data.userId = extractedUser.id;
    next();
  } catch (error) {
    logger.error({ module: 'SocketEnsureUser Middleware', error, ip }, 'Authentication error');
    next(new Error('Authentication error: Server error'));
  }
};

/**
 * Extract Any token from IncommingRequest (Auth Bearer or Cookie or Cookies)
 */
export const extractTokenFromCookie = async (request: ExpressRequest | Request, tokenName: string) => {
  let token: string | undefined;
  // get from query string
  token = request.url.split(`${tokenName}=`)[1];
  logger.trace({ url: request.url, token }, 'got url extract');

  if (!token) {
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
      token = parsedTokenValue?.[1];
    }
    logger.trace({ tokenFound: !!token, tokenName }, 'COOKIE');
  }
  return token;
};

/**
 * Attempt to retrieve user from JWT Authorisation token
 */
export const extractUserFromToken = async (token: string): Promise<User | null> => {
  return new Promise(async (resolve, reject) => {
    try {
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

        logger.trace({ module: 'ExtractAuthUser', user, tokenFound: !!token }, 'User decrypted');

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
    } catch (err) {
      logger.error({ err }, 'Error:extractUserFromToken');
      resolve(null);
    }
  });
};

/**
 * Extract API Key from IncommingRequest
 */
export const extractApiKey = async (request: ExpressRequest | Request) => {
  const apiKeyHeader = request.headers['api-key'];
  logger.trace({ module: 'Permissions::extractApiKey', apiKeyLength: apiKeyHeader?.length || 0 }, 'Request');

  return apiKeyHeader;
};

/**
 * Attempt to retrieve user via API key
 */
export const extractUserFromApiKey = (apiKey: string, ip: string): Promise<User | null> => {
  return new Promise(async (resolve, reject) => {
    try {
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

      const loggedInUserEmail = user?.email as string;
      const shouldFetchUserByOrcId = Boolean(user.orcid);

      const retrievedUser = shouldFetchUserByOrcId
        ? await getUserByOrcId(user.orcid)
        : await getUserByEmail(loggedInUserEmail);

      if (!retrievedUser || !retrievedUser.id) {
        resolve(null);
        return;
      }

      resolve(retrievedUser);
    } catch (err) {
      logger.error({ err }, 'Error:extractUserFromApiKey');
      resolve(null);
    }
  });
};

/*
 ** Parse cookies from a WebSocket connection header
 */
function parseWsCookies(cookieString: string): { [key: string]: string } {
  return cookieString?.split(';').reduce(
    (cookies, cookie) => {
      const [name, value] = cookie.trim().split('=');
      cookies[name] = decodeURIComponent(value);
      return cookies;
    },
    {} as { [key: string]: string },
  );
}
