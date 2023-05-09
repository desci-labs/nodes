import { Node, NodeAccess, ResearchCredits, ResearchRoles, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import prisma from 'client';
import { getUserByEmail, getUserByOrcId } from 'services/user';

// import { CustomError } from '../utils/response/custom-error/CustomError';
import { retrieveUser } from './ensureUser';

interface RequestWithUser extends Request {
  user: User;
}

export interface RequestNodeUser extends Request {
  user: User;
  node: Node;
  nodeAccess: NodeAccess;
}

export const ensureNodeAccess = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const user = await (req.user || retrieveUser(req));
  const uuid = req.body?.uuid || req.query?.uuid || req.params?.uuid;
  console.log('EnsureNodeAccess:: => ', user.email, uuid);

  const node = await prisma.node.findFirst({ where: { uuid: uuid + '.' } });

  if (!node) {
    res.status(404).send({ message: 'Not found' });
    return;
  }
  console.log('EnsureNodeAccess::Node => ', node);

  const nodeAccess = await prisma.nodeAccess.findFirst({
    where: { uuid: uuid + '.', userId: user.id },
    include: { role: {} },
  });
  console.log('EnsureNodeAccess::Access => ', nodeAccess);

  if (!nodeAccess) {
    res.status(401).send({ message: '' });
    return;
  }

  (req as any).node = node;
  (req as any).nodeAccess = nodeAccess;
  next();
};

export const ensureNodeAdmin = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const user = await (req.user || retrieveUser(req));
  const uuid = req.body?.uuid || req.query?.uuid || req.params?.uuid;
  console.log('EnsureNodeAccess:: => ', user.email, uuid);

  const node = await prisma.node.findFirst({ where: { uuid: uuid + '.' } });

  if (!node) {
    res.status(404).send({ message: 'Not found' });
    return;
  }
  console.log('EnsureNodeAccess::Node => ', node);

  const nodeAccess = await prisma.nodeAccess.findFirst({
    where: { uuid: uuid + '.', userId: user.id, role: { role: ResearchRoles.ADMIN } },
    include: { role: {} },
  });
  console.log('EnsureNodeAccess::Access => ', nodeAccess);

  if (!nodeAccess) {
    res.status(401).send({ message: '' });
    return;
  }

  (req as any).node = node;
  (req as any).nodeAccess = nodeAccess;
  next();
};

export const retrieveNodeAccess = async (req: Request, uuid) => {
  return true;
};
