import { Node, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from '../client.js';

// import { CustomError } from '../utils/response/custom-error/CustomError';
import { extractAuthToken, extractUserFromToken } from './permissions.js';
import logger from '../logger.js';
import { hideEmail } from '../services/user.js';

export interface RequestWithUser extends Request {
  user: User;
}

export interface RequestWithNode extends RequestWithUser {
  node: Node;
  // nodeAccess: NodeAccess;
}

export const ensureNodeAccess = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  logger.info('START EnsureNodeAccess');
  const token = await extractAuthToken(req);
  const user = await extractUserFromToken(token);

  if (!(user && user.id > 0)) {
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }
  req.user = user;

  const uuid = req.body?.uuid || req.query?.uuid || req.params?.uuid;

  if (!uuid) {
    logger.info({ module: 'GetNodeDocument' }, 'Node not found', 'Request Params', req.params);
    res.status(400).send({ message: 'Bad Request' });
    return;
  }
  logger.info('[EnsureNodeAccess]:: => ', { email: hideEmail(user.email), uuid });

  const node = await prisma.node.findFirst({ where: { uuid: uuid + '.', ownerId: user.id } });

  if (!node) {
    logger.info({ module: 'GetNodeDocument' }, `Node not found ${req.params}`);
    res.status(401).send({ message: 'Unauthorized' });
    return;
  }

  (req as RequestWithNode).node = node;
  logger.info('END EnsureNodeAccess');
  next();
};
