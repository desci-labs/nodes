import { Request, Response, NextFunction } from 'express';
import client from '../../client';

export const list = async (req: Request, res: Response, next: NextFunction) => {
  const users = await client.user.findMany();
  res.send({ users });
};
