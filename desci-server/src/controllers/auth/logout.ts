import { Request, Response, NextFunction } from 'express';

import { AUTH_COOKIE_FIELDNAME } from '../../utils/sendCookie.js';

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  // req.session.destroy((err) => {
  // if you send data here it gives an error and kills the process lol
  // });
  res.cookie(AUTH_COOKIE_FIELDNAME, 'unset', {
    maxAge: 0,
    httpOnly: true, // Ineffective whilst we still return the bearer token to the client in the response
    secure: process.env.NODE_ENV === 'production',
    domain: process.env.NODE_ENV === 'production' ? '.desci.com' : 'localhost',
    sameSite: 'lax',
    path: '/',
  });

  (process.env.COOKIE_DOMAIN?.split(',') || [undefined]).map((domain) => {
    res.cookie(AUTH_COOKIE_FIELDNAME, 'unset', {
      maxAge: 0,
      httpOnly: true, // Ineffective whilst we still return the bearer token to the client in the response
      secure: process.env.NODE_ENV === 'production',
      domain: process.env.NODE_ENV === 'production' ? domain || '.desci.com' : 'localhost',
      sameSite: 'lax',
      path: '/',
    });
  });

  if (process.env.SERVER_URL === 'https://nodes-api-dev.desci.com') {
    // insecure cookie for local dev, should only be used for testing
    res.cookie(AUTH_COOKIE_FIELDNAME, 'unset', {
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }

  res.send('Logged out successfully');
};
