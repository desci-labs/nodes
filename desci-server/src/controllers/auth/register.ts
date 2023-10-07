import { Request, Response, NextFunction } from 'express';

import prisma from 'client';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  const { email, tokendId } = req.body;

  if (!email) {
    res.status(400).send({ ok: false });
    return;
  }

  const user = await prisma.user.upsert({
    where: {
      email,
    },
    update: {},
    create: {
      email,
      isPatron: false,
      isWarden: false,
      isKeeper: false,
    },
  });

  res.send(user);
};
