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
  logger.trace({ hasToken: !!token, hasApiKey: !!apiKey, hasUser: !!retrievedUser }, 'ENSURE USER');
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
const sanitizeToken = (token: string | null | undefined): string | null => {
  if (!token) return null;
  // The frontend has been observed sending these as literal strings.
  if (token === 'null' || token === 'undefined') return null;
  return token;
};

export const extractAuthToken = async (request: ExpressRequest | Request) => {
  // The Authorization header wins over the cookie. An explicitly attached
  // credential must beat an ambient one.
  //
  // This used to be the other way around, and it produced split-brain identity.
  // sciweave-web keeps the JWT in localStorage (Safari ITP blocks the
  // cross-origin cookie) but ALSO writes a long-lived `auth` cookie on
  // .sciweave.com. Same-origin routes authenticate from the x-auth-token header;
  // everything here authenticated from the cookie. Once those two stores could
  // hold different identities — sign into a second account in a browser that
  // already held one — the app showed you account B while this server acted as
  // account A. Observed in production 2026-08-05: a brand-new signup was served
  // another user's subscription (premium/unlimited), had its profile updates
  // written to that other user's row (so onboarding asked for a name forever),
  // and was handed that user's Stripe billing portal with their saved card and
  // invoice history.
  //
  // Cookie remains the fallback, so cookie-only callers (SSR forwarding, older
  // clients) are unaffected.
  const authHeader = request.headers['authorization'];
  const headerToken = sanitizeToken(authHeader ? authHeader.split(' ')[1] : null);

  if (headerToken) {
    logger.trace({ module: 'Permissions::extractToken', source: 'header' }, 'extractAuthToken');
    return headerToken;
  }

  const cookieToken = sanitizeToken(await extractTokenFromCookie(request, AUTH_COOKIE_FIELDNAME));

  logger.trace(
    {
      module: 'Permissions::extractToken',
      source: cookieToken ? 'cookie' : 'none',
      hasAuthHeader: !!authHeader,
    },
    'extractAuthToken',
  );

  return cookieToken;
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
  logger.trace({ hasUrlToken: !!token }, 'got url extract');

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
    logger.trace({ hasToken: !!token, tokenName }, 'COOKIE');
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
  logger.trace({ module: 'Permissions::extractApiKey', hasApiKey: !!apiKeyHeader }, 'Request');

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
