import { AutomergeUrl } from '@automerge/automerge-repo';
import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';

import { prisma } from '../client.js';
import { logger } from '../logger.js';
import server from '../server.js';
import { ResearchObjectDocument } from '../types/documents.js';

export type NodeUuid = string & { _kind: 'uuid' };

export const createManifestDocument = async function ({ node, manifest }: { node: Node; manifest: ResearchObjectV1 }) {
  logger.info({ uuid: node.uuid }, 'START [CreateNodeDocument]');
  const uuid = node.uuid.replace(/\.$/, '');
  const backendRepo = server.repo;
  logger.info('[Backend REPO]:', backendRepo.networkSubsystem.peerId);

  const handle = backendRepo.create<ResearchObjectDocument>();
  handle.change((d) => {
    d.manifest = manifest;
    d.uuid = uuid.slice(0, -1);
  });

  const document = await handle.doc();
  logger.info('[AUTOMERGE]::[HANDLE NEW CHANGED]', handle.url, handle.isReady(), document);

  await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: handle.documentId } });

  logger.info('END [CreateNodeDocument]', { documentId: handle.documentId });
  return handle.documentId;
};

export const getDraftManifestFromUuid = async function (uuid: NodeUuid) {
  logger.info({ uuid }, 'START [getLatestNodeManifest]');
  const backendRepo = server.repo;
  const node = await prisma.node.findFirst({
    where: { uuid },
  });

  if (!node) {
    throw new Error(`Node with uuid ${uuid} not found!`);
  }

  const automergeUrl = `automerge:${node.manifestDocumentId}`;
  const handle = backendRepo.find<ResearchObjectDocument>(automergeUrl as AutomergeUrl);

  const document = await handle.doc();

  logger.info({ document }, '[AUTOMERGE]::[Document Found]');

  logger.info('END [getLatestNodeManifest]', { manifest: document.manifest });
  return document.manifest;
};

export const getDraftManifest = async function (node: Node) {
  return getDraftManifestFromUuid(node.uuid as NodeUuid);
};
