import { Request, Response, NextFunction } from 'express';

import { AUTH_COOKIE_FIELDNAME, removeCookie } from '../../utils/sendCookie.js';

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  removeCookie(res, AUTH_COOKIE_FIELDNAME);
  res.send('Logged out successfully');
  return;
};
