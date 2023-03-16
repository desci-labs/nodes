import { Request, Response, NextFunction } from 'express';
import * as waitlist from '../../services/waitlist';

export const list = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;

  try {
    const l = await waitlist.list();
    res.send({ waitlist: l });
  } catch (err) {
    res.status(400).send({ success: false, error: err.message });
  }
};
