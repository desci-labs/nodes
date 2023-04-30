import { Request, Response, NextFunction } from 'express';
import prisma from 'client';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body;

  res.send({ ok: false });

};
