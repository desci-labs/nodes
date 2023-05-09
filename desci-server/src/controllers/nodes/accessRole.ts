import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import { RequestWithUser } from 'middleware/nodeGuard';

export const getNodeAccessRoles = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const roles = await prisma.nodeCreditRoles.findMany({});
    res.send({ roles });
  } catch (e) {
    res.status(500).send({ message: 'Unknow Error occured' });
  }
};
