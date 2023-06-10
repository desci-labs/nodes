import { Node, NodeAccess, ResearchCredits, ResearchRoles, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import prisma from 'client';
import { getUserByEmail, getUserByOrcId } from 'services/user';

// import { CustomError } from '../utils/response/custom-error/CustomError';
import { retrieveUser } from './ensureUser';

export interface RequestWithUser extends Request {
  user: User;
}

export interface RequestWithNodeAccess extends RequestWithUser {
  node: Node;
  nodeAccess: NodeAccess;
}

export const ensureNodeAccess = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const user = await retrieveUser(req);

  if (!(user && user.id > 0)) {
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }
  req.user = user;

  const uuid = req.body?.uuid || req.query?.uuid || req.params?.uuid;
  console.log('EnsureNodeAccess:: => ', user.email, uuid);

  const node = await prisma.node.findFirst({ where: { uuid: uuid + '.' } });

  if (!node || !uuid) {
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

  (req as RequestWithNodeAccess).node = node;
  (req as RequestWithNodeAccess).nodeAccess = nodeAccess;
  next();
};

export const ensureNodeAdmin = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const user = await retrieveUser(req);

  if (!(user && user.id > 0)) {
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }
  req.user = user;

  const uuid = req.body?.uuid || req.query?.uuid || req.params?.uuid;
  console.log('EnsureNodeAdmin:: => ', user.email, uuid);

  const node = await prisma.node.findFirst({ where: { uuid: uuid + '.' } });

  if (!node) {
    res.status(404).send({ message: 'Not found' });
    return;
  }
  console.log('EnsureNodeAdmin::Node => ', node);

  const nodeAccess = await prisma.nodeAccess.findFirst({
    where: { uuid: uuid + '.', userId: user.id, role: { role: ResearchRoles.ADMIN } },
    include: { role: {} },
  });
  console.log('EnsureNodeAdmin::Access => ', nodeAccess);

  if (!nodeAccess) {
    res.status(401).send({ message: '' });
    return;
  }

  (req as RequestWithNodeAccess).node = node;
  (req as RequestWithNodeAccess).nodeAccess = nodeAccess;
  next();
};

export const retrieveNodeAccess = async (req: Request, uuid) => {
  return true;
};
