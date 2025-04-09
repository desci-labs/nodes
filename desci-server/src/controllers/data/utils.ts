import {
  DRIVE_NODE_ROOT_PATH,
  DataComponent,
  ResearchObjectComponentType,
  ResearchObjectV1,
} from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';
import { v4 as uuid } from 'uuid';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { getNodeToUse, updateManifestAndAddToIpfs } from '../../services/ipfs.js';
import { cleanupManifestUrl } from '../../utils/manifest.js';

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
      path: DRIVE_NODE_ROOT_PATH + `/${dataFields.title}`,
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

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isGuest: true } });

  try {
    const {
      cid,
      ref: dataRef,
      nodeVersion,
    } = await updateManifestAndAddToIpfs(manifest, {
      user,
      nodeId: node.id,
      ipfsNode: getNodeToUse(user?.isGuest),
    });

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

export async function getLatestManifestFromRepo(uuid: string): Promise<ResearchObjectV1 | null> {
  // todo: retrieve documentId from uuid and call repo.find to get latest document manifest;

  return null;
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

export const DOI_REGEX = /(https:\/\/doi.org\/)?(?<doi>10.\d{4,9}\/[-._;()/:A-Z0-9]+$)/i;
export function isDoiLink(url: string): boolean {
  try {
    const matches = url.match(DOI_REGEX);
    console.log('matches', matches);
    return DOI_REGEX.test(url);
  } catch (e) {
    return false;
  }
}
