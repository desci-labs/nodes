import { DocumentId } from '@automerge/automerge-repo';
import { query } from '../db/index.js';
import { logger } from '../logger.js';

export const verifyNodeDocumentAccess = async (userId: number, documentId: DocumentId) => {
  try {
    const rows = await query('SELECT * FROM "Node" WHERE "manifestDocumentId" = $1 AND "ownerId" = $2', [
      documentId,
      userId,
    ]);
    const node = rows?.[0];
    if (!node) return false;

    if (node.manifestDocumentId === documentId && node.ownerId === userId) return true;
    return false;
  } catch (error) {
    logger.error({ error }, 'VerifyNodeDocumentAccess');
    return false;
  }
};
