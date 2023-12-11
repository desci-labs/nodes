import { DataComponent, DrivePath, ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';
import { v4 as uuid } from 'uuid';

import prisma from 'client';
import { REPO_SERVICE_API_KEY, REPO_SERVICE_API_URL } from 'config';
import parentLogger from 'logger';
import { updateManifestAndAddToIpfs } from 'services/ipfs';
import { cleanupManifestUrl } from 'utils/manifest';

const logger = parentLogger.child({
  module: 'DATA::Utils',
});
interface UpdatingManifestParams {
  manifest: ResearchObjectV1;
  rootCid: string;
  dataFields: { title: string; description?: string };
}

function addDataToManifest({ manifest, dataFields, rootCid }: UpdatingManifestParams) {
  if (manifest.components.filter((c) => c.id === rootCid).length > 0) {
    throw Error('Duplicate component');
  }

  const newDataComponent: DataComponent = {
    id: uuid(),
    name: dataFields.title,
    type: ResearchObjectComponentType.DATA,
    payload: {
      cid: rootCid,
      subMetadata: {},
      description: dataFields.description || undefined,
    },
  };
  manifest.components.push(newDataComponent);
  return manifest;
}

export interface PersistManifestParams {
  manifest: ResearchObjectV1;
  node: Node;
  userId: number;
}

export async function persistManifest({ manifest, node, userId }: PersistManifestParams) {
  if (node.ownerId !== userId) {
    logger.warn({ fn: 'persistManifest', node, userId }, `User: ${userId} doesnt own node ${node.id}`);
    throw Error(`User: ${userId} doesnt own node ${node.id}`);
  }

  try {
    const {
      cid,
      ref: dataRef,
      nodeVersion,
    } = await updateManifestAndAddToIpfs(manifest, { userId: node.ownerId, nodeId: node.id });

    const updated = await prisma.node.update({
      where: {
        id: node.id,
      },
      data: {
        manifestUrl: cid,
      },
    });

    if (updated && nodeVersion && dataRef) return { persistedManifestCid: cid, date: dataRef.updatedAt, nodeVersion };
  } catch (e: any) {
    logger.error(
      { fn: 'persistManifest', manifest, node, userId, error: e },
      `failed persisting manifest, manifest: ${manifest}, dbnode: ${node}, userId: ${userId}, e: ${e}`,
    );
  }
  return { persistedManifestCid: null, date: null };
}

export async function getLatestManifest(
  nodeUuid: string,
  resolver: string,
  node?: Node,
): Promise<ResearchObjectV1 | null> {
  node = node || (await prisma.node.findUnique({ where: { uuid: nodeUuid } }));
  const latestManifestCid = node.manifestUrl || node.cid;
  const manifestUrl = latestManifestCid ? cleanupManifestUrl(latestManifestCid as string, resolver as string) : null;

  return manifestUrl ? await (await axios.get(manifestUrl)).data : null;
}

export async function getLatestManifestFromRepo(nodeUuid: string): Promise<ResearchObjectV1 | null> {
  const repoServiceResponse = await axios.get<{ manifest: ResearchObjectV1 }>(
    `${REPO_SERVICE_API_URL}/v1/nodes/documents/getLatestManifest/${nodeUuid}`,
    {
      headers: { 'x-api-key': REPO_SERVICE_API_KEY },
    },
  );
  console.log('[getLatestManifestFromRepo]', JSON.stringify(repoServiceResponse?.data?.manifest ?? {}));
  return repoServiceResponse.data.manifest;
}

export function separateFileNameAndExtension(fileName: string): {
  fileName: string;
  extension?: string;
} {
  const splitName = fileName.split('.');
  const extension = splitName.length > 1 ? splitName.pop() : '';
  const name = splitName.join('.');
  return { fileName: name, extension };
}
