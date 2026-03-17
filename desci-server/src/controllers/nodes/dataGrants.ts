import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

const logger = parentLogger.child({ module: 'Nodes::DataGrants' });

export const createDataGrant = async (req: Request, res: Response): Promise<void> => {
  const owner = (req as any).user;
  const uuid = req.params.uuid as string;
  const { email, memo } = req.body;

  if (!email) {
    res.status(400).json({ ok: false, message: 'email is required' });
    return;
  }

  const normalizedUuid = ensureUuidEndsWithDot(uuid);

  const node = await prisma.node.findFirst({
    where: { uuid: normalizedUuid, ownerId: owner.id, isDeleted: false },
  });

  if (!node) {
    res.status(403).json({ ok: false, message: 'Node not found or not owned by you' });
    return;
  }

  const grantee = await prisma.user.findFirst({
    where: { email: { equals: email.toLowerCase().trim(), mode: 'insensitive' } },
  });

  if (!grantee) {
    res.status(404).json({ ok: false, message: 'User not found' });
    return;
  }

  if (grantee.id === owner.id) {
    res.status(400).json({ ok: false, message: 'Cannot grant access to yourself — you already own this node' });
    return;
  }

  const grant = await prisma.nodeDataGrant.upsert({
    where: { nodeUUID_granteeId: { nodeUUID: normalizedUuid, granteeId: grantee.id } },
    update: { revokedAt: null, memo: memo || null, grantedById: owner.id },
    create: {
      nodeUUID: normalizedUuid,
      granteeId: grantee.id,
      grantedById: owner.id,
      memo: memo || null,
    },
  });

  logger.info({ nodeUuid: normalizedUuid, granteeId: grantee.id, grantId: grant.id }, 'Data grant created');
  res.json({ ok: true, grant: { id: grant.id, granteeEmail: email, memo: grant.memo, createdAt: grant.createdAt } });
};

export const revokeDataGrant = async (req: Request, res: Response): Promise<void> => {
  const owner = (req as any).user;
  const uuid = req.params.uuid as string;
  const granteeId = parseInt(req.params.granteeId, 10);

  if (isNaN(granteeId)) {
    res.status(400).json({ ok: false, message: 'Invalid granteeId' });
    return;
  }

  const normalizedUuid = ensureUuidEndsWithDot(uuid);

  const node = await prisma.node.findFirst({
    where: { uuid: normalizedUuid, ownerId: owner.id, isDeleted: false },
  });

  if (!node) {
    res.status(403).json({ ok: false, message: 'Node not found or not owned by you' });
    return;
  }

  const grant = await prisma.nodeDataGrant.findFirst({
    where: { nodeUUID: normalizedUuid, granteeId, revokedAt: null },
  });

  if (!grant) {
    res.status(404).json({ ok: false, message: 'Active grant not found' });
    return;
  }

  await prisma.nodeDataGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() },
  });

  logger.info({ nodeUuid: normalizedUuid, granteeId, grantId: grant.id }, 'Data grant revoked');
  res.json({ ok: true });
};

export const listDataGrants = async (req: Request, res: Response): Promise<void> => {
  const owner = (req as any).user;
  const uuid = req.params.uuid as string;
  const normalizedUuid = ensureUuidEndsWithDot(uuid);

  const node = await prisma.node.findFirst({
    where: { uuid: normalizedUuid, ownerId: owner.id, isDeleted: false },
  });

  if (!node) {
    res.status(403).json({ ok: false, message: 'Node not found or not owned by you' });
    return;
  }

  const grants = await prisma.nodeDataGrant.findMany({
    where: { nodeUUID: normalizedUuid, revokedAt: null },
    include: { grantee: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    ok: true,
    grants: grants.map((g) => ({
      id: g.id,
      granteeId: g.grantee.id,
      granteeEmail: g.grantee.email,
      granteeName: g.grantee.name,
      memo: g.memo,
      createdAt: g.createdAt,
    })),
  });
};

export const listMyGrants = async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;

  const grants = await prisma.nodeDataGrant.findMany({
    where: { granteeId: user.id, revokedAt: null, node: { isDeleted: false } },
    include: {
      node: { select: { uuid: true, title: true } },
      grantedBy: { select: { email: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    ok: true,
    grants: grants.map((g) => ({
      id: g.id,
      nodeUUID: g.node.uuid,
      nodeTitle: g.node.title,
      grantedByEmail: g.grantedBy.email,
      grantedByName: g.grantedBy.name,
      memo: g.memo,
      createdAt: g.createdAt,
    })),
  });
};
