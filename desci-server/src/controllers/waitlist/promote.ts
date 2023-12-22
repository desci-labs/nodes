import { Request, Response, NextFunction } from 'express';

import * as waitlist from '../../services/waitlist.js';

export const promote = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  try {
    const l = await waitlist.promote(parseInt(req.params.id));
    res.send({ ok: true });
  } catch (err) {
    res.status(400).send({ success: false, error: err.message });
  }
};
