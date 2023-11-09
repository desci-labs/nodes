import { Node, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import parentLogger from 'logger';

export interface AuthedRequest extends Request {
  user?: User;
  node?: Node;
}

export const ensureWriteAccess = async (req: Request, res: Response, next: NextFunction) => {
  // Comes after ensureUser middleware, or if formdata fields are used, it should come after the middleware processing the formdata.
  const user = (req as any).user;
  const { uuid } = req.body;

  const logger = parentLogger.child({
    module: 'MIDDLEWARE::ensureWriteAccess',
    user,
    uuid: uuid,
  });

  if (!user || !uuid) {
    logger.warn(user, `unauthed user entered ensureWriteAccess middleware, rejecting`);
    return res.status(401).send({ ok: false, message: 'Unauthorized' });
  }

  //validate requester owns the node
  const node = await prisma.node.findFirst({
    where: {
      ownerId: user.id,
      uuid: uuid.endsWith('.') ? uuid : uuid + '.',
    },
  });
  if (!node) {
    logger.warn(user, `unauthed node user: ${user.id}, node uuid provided: ${uuid}`);
    return res.status(401).send({ ok: false, message: 'Unauthorized' });
  }

  (req as any).node = node;
  return next();
};

interface EnsureWriteAccessCheckResult  {
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
    return {ok: false}
  }

    //validate requester owns the node
    const node = await prisma.node.findFirst({
      where: {
        ownerId: user.id,
        uuid: uuid.endsWith('.') ? uuid : uuid + '.',
      },
    });
    if (!node) {
      logger.warn(user, `unauthed node user: ${user.id}, node uuid provided: ${uuid}`);
      return {ok: false}
    }
  
  return {ok: true, node}
}