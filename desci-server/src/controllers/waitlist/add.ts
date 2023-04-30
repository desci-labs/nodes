import { Request, Response, NextFunction } from 'express';
import * as waitlist from '../../services/waitlist';

export const add = async (req: Request, res: Response, next: NextFunction) => {
  let success: Boolean = false;
  try {
    success = await waitlist.addUser(req.body.email);
    res.send({ success });
  } catch (err) {
    res.status(400).send({ success, error: err.message });
  }
};
