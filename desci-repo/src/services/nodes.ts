// import { prisma } from '../client.js';
import { query } from '../db/index.js';

export const verifyNodeDocumentAccess = async (userId: number, documentId: string) => {
  try {
    console.log('START [verifyNodeDocumentAccess]::Node', { userId, documentId });
    const rows = await query('SELECT * FROM "Node" WHERE "manifestDocumentId" = $1 AND "ownerId" = $2', [
      documentId,
      userId,
    ]);
    const node = rows[0];
    console.log('[verifyNodeDocumentAccess]::Node', node.uuid, node.ownerId, node.manifestDocumentId);

    if (!node) return false;

    if (node.manifestDocumentId === documentId && node.ownerId === userId) return true;
    return false;
  } catch (e) {
    return false;
  }
};
