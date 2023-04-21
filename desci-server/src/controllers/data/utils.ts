import { DataComponent, ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import { v4 as uuid } from 'uuid';

import prisma from 'client';
import { updateManifestAndAddToIpfs } from 'services/ipfs';

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

interface PersistManifestParams {
  manifest: ResearchObjectV1;
  node: Node;
  userId: number;
}

export async function persistManifest({ manifest, node, userId }: PersistManifestParams) {
  if (node.ownerId !== userId) {
    console.log(`User: ${userId} doesnt own node ${node.id}`);
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
    console.error(`failed persisting manifest, manifest: ${manifest}, dbnode: ${node}, userId: ${userId}, e: ${e}`);
  }
  return { persistedManifestCid: null, date: null };
}
