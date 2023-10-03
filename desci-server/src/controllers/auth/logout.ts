import { Request, Response, NextFunction } from 'express';

import { oneYear } from './magic';

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  // req.session.destroy((err) => {
  // if you send data here it gives an error and kills the process lol
  // });
  res.clearCookie('auth', {
    maxAge: oneYear,
    httpOnly: true, // Ineffective whilst we still return the bearer token to the client in the response
    secure: process.env.NODE_ENV === 'production',
    domain: process.env.NODE_ENV === 'production' ? '.desci.com' : 'localhost',
    sameSite: 'strict',
  });
  res.send('Logged out successfully');
};
