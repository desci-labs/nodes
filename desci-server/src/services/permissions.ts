import { prisma } from '../client.js';

export const verifyNodeDocumentAccess = async (userId: number, documentId: string) => {
  try {
    const node = await prisma.node.findFirst({
      where: { AND: [{ manifestDocumentId: documentId }, { ownerId: userId }] },
    });
    if (!node) return false;

    if (node.manifestDocumentId === documentId && node.ownerId === userId) return true;
    return false;
  } catch (e) {
    return false;
  }
};
