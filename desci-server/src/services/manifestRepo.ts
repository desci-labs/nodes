import { AutomergeUrl, DocumentId } from '@automerge/automerge-repo';
import { Node } from '@prisma/client';
import { logger } from '../logger.js';
import { getManifestFromNode } from './data/processing.js';
import repoService from './repoService.js';

export type NodeUuid = string & { _kind: 'uuid' };

export const getAutomergeUrl = (documentId: DocumentId): AutomergeUrl => {
  return `automerge:${documentId}` as AutomergeUrl;
};

export const getLatestManifestFromNode = async (
  node: Pick<Node, "manifestUrl" | "uuid">
) => {
  logger.info({ uuid: node.uuid }, 'START [getLatestManifestFromNode]');
  let manifest = await repoService.getDraftManifest(node.uuid as NodeUuid);
  if (!manifest) {
    const publishedManifest = await getManifestFromNode(node);
    manifest = publishedManifest.manifest;
  }
  return manifest;
};

export function assertNever(value: never) {
  console.error('Unknown value', value);
  throw Error('Not Possible');
};
