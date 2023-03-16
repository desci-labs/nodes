import { User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import prisma from 'client';

import { CustomError } from '../utils/response/custom-error/CustomError';

import { retrieveUser } from './ensureUser';

export const ensureUserIfPresent = async (req: Request, res: Response, next: NextFunction) => {
  const retrievedUser = await retrieveUser(req);

  if (retrievedUser) {
    (req as any).user = retrievedUser;
  }

  next();
};
