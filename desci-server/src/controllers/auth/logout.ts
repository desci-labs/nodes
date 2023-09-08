import { Request, Response, NextFunction } from 'express';

import { oneYear } from './magic';

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  // req.session.destroy((err) => {
  // if you send data here it gives an error and kills the process lol
  // });
  res.clearCookie('auth');
  res.send('Logged out successfully');
};
