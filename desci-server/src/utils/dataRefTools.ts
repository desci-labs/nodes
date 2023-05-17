import { ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { DataType, Prisma } from '@prisma/client';
import axios from 'axios';

import prisma from 'client';
import { PUBLIC_IPFS_PATH } from 'config';
import { getDirectoryTree } from 'services/ipfs';

import {
  generateExternalCidMap,
  recursiveFlattenTree,
  generateManifestPathsToDbTypeMap,
  neutralizePath,
} from './driveUtils';

// generates data references for the contents of a manifest|
export async function generateDataReferences(
  nodeUuid: string,
  manifestCid: string,
  versionId?: number,
): Promise<Prisma.DataReferenceCreateManyInput[] | Prisma.PublicDataReferenceCreateManyInput[]> {
  const node = await prisma.node.findFirst({
    where: {
      uuid: nodeUuid + '.',
    },
  });

  const manifestEntry: ResearchObjectV1 = (await axios.get(`${PUBLIC_IPFS_PATH}/${manifestCid}`)).data;
  const dataBucketCid = manifestEntry.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload
    .cid;

  const dataRootEntry: Prisma.DataReferenceCreateManyInput = {
    cid: dataBucketCid,
    userId: node.ownerId,
    root: true,
    directory: true,
    size: 0,
    type: DataType.DATA_BUCKET,
    nodeId: node.id,
    ...(versionId ? { versionId } : {}),
  };

  const externalCidMap = await generateExternalCidMap(node.uuid);
  const dataTree = recursiveFlattenTree(await getDirectoryTree(dataBucketCid, externalCidMap));
  const manifestPathsToDbTypes = generateManifestPathsToDbTypeMap(manifestEntry);

  const dataTreeToPubRef: Prisma.DataReferenceCreateManyInput[] = dataTree.map((entry) => {
    const neutralPath = neutralizePath(entry.path);
    return {
      cid: entry.cid,
      userId: node.ownerId,
      root: false,
      directory: entry.type === 'dir',
      size: entry.size,
      type: manifestPathsToDbTypes[neutralPath] || DataType.UNKNOWN,
      nodeId: node.id,
      ...(versionId ? { versionId } : {}),
    };
  });

  return [dataRootEntry, ...dataTreeToPubRef];
}

export async function validateDataReferences(nodeUuid: string, manifestCid: string, publicRefs: boolean) {
  const node = await prisma.node.findFirst({
    where: {
      uuid: nodeUuid + '.',
    },
  });

  const manifestEntry: ResearchObjectV1 = (await axios.get(`${PUBLIC_IPFS_PATH}/${manifestCid}`)).data;
  const dataBucketCid = manifestEntry.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload
    .cid;

  const currentRefs = publicRefs
    ? await prisma.publicDataReference.findMany({ where: { nodeId: node.id } })
    : await prisma.dataReference.findMany({ where: { nodeId: node.id } });

  const requiredRefs = await generateDataReferences(nodeUuid, node.manifestUrl);

  const missingRefs = [];

  requiredRefs.forEach((requiredRef) => {
    const exists = currentRefs.find(
      (currentRef) => currentRef.cid === requiredRef.cid && currentRef.path === requiredRef.path,
    );
    if (!exists) missingRefs.push(requiredRef);
  });

  if (missingRefs.length) {
    console.log(
      `[validateDataReferences] node id: ${node} is missing ${missingRefs.length} data refs for the dataBucketCid: ${dataBucketCid}, missingRefs: ${missingRefs}`,
    );
  }
  return missingRefs;
}

export async function validateAndFixDataRefs(nodeUuid: string, manifestCid: string, publicRefs: boolean) {
  const missingRefs = await validateDataReferences(nodeUuid, manifestCid, publicRefs);
  if (missingRefs.length) {
    const addedRefs = publicRefs
      ? await prisma.publicDataReference.createMany({
          data: missingRefs,
          skipDuplicates: true,
        })
      : await prisma.dataReference.createMany({
          data: missingRefs,
          skipDuplicates: true,
        });
    console.log(`[validateAndFixDataRefs] node id: ${nodeUuid}, added ${addedRefs} missing data refs`);
  }
}
