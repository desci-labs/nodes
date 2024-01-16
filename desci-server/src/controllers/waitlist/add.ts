import { Request, Response, NextFunction } from 'express';

import * as waitlist from '../../services/waitlist.js';

export const add = async (req: Request, res: Response, next: NextFunction) => {
  let success: boolean = false;
  try {
    success = await waitlist.addUser(req.body.email);
    res.send({ success });
  } catch (err) {
    res.status(400).send({ success, error: err.message });
  }
};
