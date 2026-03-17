import { prisma } from '../client.js';
import { ensureUuidEndsWithDot } from '../utils.js';

export async function checkCentralizedDataAccess(
  normalizedUuid: string,
  shareId: string | undefined,
  user: { id: number } | undefined,
): Promise<{ hasAccess: boolean; isOwner: boolean }> {
  // 1. shareId path
  if (shareId) {
    const privateShare = await prisma.privateShare.findFirst({
      where: { shareId, nodeUUID: normalizedUuid },
    });
    if (privateShare) {
      return { hasAccess: true, isOwner: false };
    }
  }

  if (!user) return { hasAccess: false, isOwner: false };

  // 2. Owner path
  const ownedNode = await prisma.node.findFirst({
    where: { uuid: normalizedUuid, ownerId: user.id },
  });
  if (ownedNode) {
    return { hasAccess: true, isOwner: true };
  }

  // 3. Grant path
  const grant = await prisma.nodeDataGrant.findFirst({
    where: {
      nodeUUID: normalizedUuid,
      granteeId: user.id,
      revokedAt: null,
    },
  });
  if (grant) {
    return { hasAccess: true, isOwner: false };
  }

  return { hasAccess: false, isOwner: false };
}
