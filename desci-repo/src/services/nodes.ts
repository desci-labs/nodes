import { DocumentId } from '@automerge/automerge-repo';
import { query } from '../db/index.js';
import { logger } from '../logger.js';

export const verifyNodeDocumentAccess = async (userId: number, documentId: DocumentId) => {
  try {
    logger.trace({ userId, documentId }, 'START [verifyNodeDocumentAccess]::Node');
    const rows = await query('SELECT * FROM "Node" WHERE "manifestDocumentId" = $1 AND "ownerId" = $2', [
      documentId,
      userId,
    ]);
    const node = rows?.[0];
    logger.trace(
      { uuid: node.uuid, userId, ownerId: node.ownerId, documentId: node.manifestDocumentId },
      '[verifyNodeDocumentAccess]::Node',
    );

    if (!node) return false;

    if (node.manifestDocumentId === documentId && node.ownerId === userId) return true;
    return false;
  } catch (e) {
    return false;
  }
};
