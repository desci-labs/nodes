// import { Node, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { extractAuthToken, extractUserFromToken } from './permissions.js';
import { logger as parentLogger } from '../logger.js';
import { hideEmail } from '../services/user.js';
import { query } from '../db/index.js';

const logger = parentLogger.child({ module: 'MIDDLEWARE/GUARD' });

export type Node = {
  id: number;
  title: string;
  cid: string;
  ownerId: number;
  uuid: string | null;
  manifestUrl: string;
  manifestDocumentId: string;
};

export interface RequestWithUser extends Request {
  user: { email: string; id: number };
}

export interface RequestWithNode extends RequestWithUser {
  node: Node;
  // nodeAccess: NodeAccess;
}

export const ensureNodeAccess = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  logger.info('START EnsureNodeAccess');
  const token = await extractAuthToken(req);

  if (!token) {
    logger.trace('Token not found');
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }

  const user = await extractUserFromToken(token);

  if (!(user && user.id > 0)) {
    logger.trace('User not found');
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }
  req.user = user;

  const uuid = req.body?.uuid || req.query?.uuid || req.params?.uuid;

  if (!uuid) {
    logger.info({ module: 'GetNodeDocument', params: req.params }, 'Node not found');
    res.status(400).send({ message: 'Bad Request' });
    return;
  }

  const rows = await query('SELECT * FROM "Node" WHERE uuid = $1 AND ownerId = $2', [uuid, user.id]);
  const node = rows?.[0];

  logger.info({ email: hideEmail(user.email), uuid, node }, '[EnsureNodeAccess]:: => ');
  if (!node) {
    logger.info({ uuid, user }, `Node not found ${req.params}`);
    res.status(401).send({ message: 'Unauthorized' });
    return;
  }

  (req as RequestWithNode).node = node;
  next();
};
