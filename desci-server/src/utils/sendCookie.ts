import { type Response } from 'express';

import { oneDay, oneYear } from '../controllers/auth/magic.js';
import { logger } from '../logger.js';
export const sendCookie = (res: Response, token: string, isDevMode: boolean) => {
  if (isDevMode && process.env.SERVER_URL === 'https://nodes-api-dev.desci.com') {
    // insecure cookie for local dev, should only be used for testing
    logger.info({ fn: 'sendCookie' }, `insecure dev cookie set`);
    res.cookie('auth', token, {
      maxAge: oneDay,
      httpOnly: true,
      sameSite: 'strict',
    });
  }

  (process.env.COOKIE_DOMAIN?.split(',') || [undefined]).map((domain) => {
    logger.info({ fn: 'sendCookie', domain, env: process.env.NODE_ENV }, `cookie set`);
    res.cookie('auth', token, {
      maxAge: oneYear,
      httpOnly: true, // Ineffective whilst we still return the bearer token to the client in the response
      secure: process.env.NODE_ENV === 'production',
      domain: process.env.NODE_ENV === 'production' ? domain || '.desci.com' : 'localhost',
      sameSite: 'strict',
    });
  });
};
