import { Node, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../client.js';
// import { CustomError } from '../utils/response/custom-error/CustomError';
import { logger as parentLogger } from '../logger.js';
import { ensureUuidEndsWithDot, hideEmail } from '../utils.js';

// import { extractAuthToken, extractUserFromToken } from './permissions.js';

export interface RequestWithUser extends Request {
  user: User;
}

export interface RequestWithNode extends RequestWithUser {
  node: Node;
}

export const ensureWriteNodeAccess = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  // Comes after ensureUser middleware, or if formdata fields are used, it should come after the middleware processing the formdata.
  const user = req.user;
  const uuid = req.body?.uuid || req.query?.uuid || req.params?.uuid;

  const logger = parentLogger.child({
    module: 'MIDDLEWARE::ensureWriteAccess',
    user: { id: user.id },
    uuid: uuid,
  });
  logger.info({ body: req.body }, 'Entered EnsureNodeAccess');
  if (!user || !uuid) {
    logger.warn(user, `unauthed user entered ensureWriteAccess middleware, rejecting`);
    return res.status(401).send({ ok: false, message: 'Unauthorized' });
  }
  //validate requester owns the node
  const node = await prisma.node.findFirst({
    where: {
      ownerId: user.id,
      uuid: ensureUuidEndsWithDot(uuid),
    },
  });
  if (!node) {
    logger.warn(user, `unauthed node user: ${user.id}, node uuid provided: ${uuid}`);
    return res.status(401).send({ ok: false, message: 'Unauthorized' });
  }
  (req as any).node = node;
  return next();
};

export const ensureNodeAccess = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const user = req.user;
  const uuid = req.body?.uuid || req.query?.uuid || req.params?.uuid;
  const logger = parentLogger.child({
    module: 'MIDDLEWARE::ensureNodeAccess',
    user: { id: user?.id },
    uuid,
  });
  logger.info('START EnsureNodeAccess');

  if (!(user && user.id > 0)) {
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }
  req.user = user;

  if (!uuid) {
    logger.error({ uuid: req.body.uuid, body: req.body }, 'No UUID Found');
    res.status(400).send({ ok: false, message: 'Bad Request: Uuid Missing' });
    return;
  }
  logger.info('[EnsureNodeAccess]:: => ', { email: hideEmail(user.email), uuid });

  const node = await prisma.node.findFirst({
    where: { uuid: ensureUuidEndsWithDot(uuid), ownerId: user.id },
  });

  if (!node) {
    res.status(400).send({ ok: false, message: `Node: ${uuid} not found` });
    return;
  }

  (req as RequestWithNode).node = node;
  logger.info({ uuid, user: user.id }, 'Access Granted');
  next();
};

interface EnsureWriteAccessCheckResult {
  ok: boolean;
  node?: Node;
}

export async function ensureWriteAccessCheck(user: User, uuid: string): Promise<EnsureWriteAccessCheckResult> {
  const logger = parentLogger.child({
    module: 'MIDDLEWARE::ensureWriteAccess',
    user,
    uuid: uuid,
  });

  if (!user || !uuid) {
    logger.warn(user, `unauthed user entered ensureWriteAccess middleware, rejecting`);
    return { ok: false };
  }

  //validate requester owns the node
  const node = await prisma.node.findFirst({
    where: {
      ownerId: user.id,
      uuid: ensureUuidEndsWithDot(uuid),
    },
  });
  if (!node) {
    logger.warn(user, `unauthed node user: ${user.id}, node uuid provided: ${uuid}`);
    return { ok: false };
  }

  return { ok: true, node };
}
