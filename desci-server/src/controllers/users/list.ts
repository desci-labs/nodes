import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';

export const list = async (req: Request, res: Response, next: NextFunction) => {
  const users = await prisma.user.findMany();
  res.send({ users });
};
