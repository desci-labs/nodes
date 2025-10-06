import { type Response } from 'express';

import { oneDay, oneMinute, oneYear } from '../controllers/auth/magic.js';
import { logger } from '../logger.js';

/**
 * To enable a wildcard auth cookie that works across all subdomains, we need to modify the auth cookie name for each domain.
 */

const AUTH_COOKIE_DOMAIN_MAPPING = {
  'http://localhost:5420': 'auth',
  'https://nodes-api.desci.com': 'auth',
  'https://nodes-api-dev.desci.com': 'auth-dev',
  'https://nodes-api-staging.desci.com': 'auth-stage',
};

// auth, auth-stage, auth-dev
export const AUTH_COOKIE_FIELDNAME = AUTH_COOKIE_DOMAIN_MAPPING[process.env.SERVER_URL] || 'auth';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || 'localhost';
const OLD_COOKIE_DOMAINS = process.env.OLD_COOKIE_DOMAINS || '';

// We remove old cookie domains, as they were sub-domain scoped and can prevent log out.
const REMOVE_COOKIE_DOMAINS = [COOKIE_DOMAIN.split(','), OLD_COOKIE_DOMAINS.split(',')].flat().filter(Boolean);

export const sendCookie = (res: Response, token: string, isDevMode: boolean, cookieName = AUTH_COOKIE_FIELDNAME) => {
  (COOKIE_DOMAIN.split(',') || [undefined]).map((domain) => {
    logger.info(
      { fn: 'sendCookie', domain, env: process.env.NODE_ENV, cookieName, AUTH_COOKIE_FIELDNAME },
      `cookie set`,
    );
    res.cookie(cookieName, token, {
      maxAge: cookieName === AUTH_COOKIE_FIELDNAME ? oneYear : oneMinute,
      httpOnly: true, // Ineffective whilst we still return the bearer token to the client in the response
      secure: process.env.NODE_ENV === 'production',
      domain: process.env.NODE_ENV === 'production' ? domain || '.desci.com' : 'localhost',
      sameSite: 'lax',
    });
  });
};

export const removeCookie = (res: Response, cookieName: string) => {
  logger.trace({ cookieName }, 'removeCookie');
  res.cookie(cookieName, 'unset', {
    maxAge: 0,
    httpOnly: true, // Ineffective whilst we still return the bearer token to the client in the response
    secure: process.env.NODE_ENV === 'production',
    domain: process.env.NODE_ENV === 'production' ? '.desci.com' : 'localhost',
    sameSite: 'none',
    path: '/',
  });

  REMOVE_COOKIE_DOMAINS?.map((domain) => {
    res.cookie(cookieName, 'unset', {
      maxAge: 0,
      httpOnly: true, // Ineffective whilst we still return the bearer token to the client in the response
      secure: process.env.NODE_ENV === 'production',
      domain: process.env.NODE_ENV === 'production' ? domain || '.desci.com' : 'localhost',
      sameSite: 'none',
      path: '/',
    });
  });

  if (process.env.SERVER_URL === 'https://nodes-api-dev.desci.com') {
    // insecure cookie for local dev, should only be used for testing
    res.cookie(cookieName, 'unset', {
      maxAge: 0,
      httpOnly: true,
      sameSite: 'none',
      path: '/',
    });
  }
};
