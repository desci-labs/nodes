import { ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { DataReference, DataType, Prisma } from '@prisma/client';
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
  if (!node) throw new Error(`Node not found for uuid ${nodeUuid}`);
  const manifestEntry: ResearchObjectV1 = (await axios.get(`${PUBLIC_IPFS_PATH}/${manifestCid}`)).data;
  const dataBucketCid = manifestEntry.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload
    .cid;

  const dataRootEntry: Prisma.DataReferenceCreateManyInput = {
    cid: dataBucketCid,
    path: dataBucketCid,
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
      path: entry.path,
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
  if (nodeUuid.endsWith('.')) nodeUuid = nodeUuid.slice(0, -1);
  const node = await prisma.node.findFirst({
    where: {
      uuid: nodeUuid + '.',
    },
  });
  if (!node) throw new Error(`Node not found for uuid ${nodeUuid}`);

  const manifestEntry: ResearchObjectV1 = (await axios.get(`${PUBLIC_IPFS_PATH}/${manifestCid}`)).data;
  const dataBucketCid = manifestEntry.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload
    .cid;

  const currentRefs = publicRefs
    ? await prisma.publicDataReference.findMany({ where: { nodeId: node.id, type: { not: DataType.MANIFEST } } })
    : await prisma.dataReference.findMany({ where: { nodeId: node.id, type: { not: DataType.MANIFEST } } });

  const requiredRefs = await generateDataReferences(nodeUuid, node.manifestUrl);

  const missingRefs = [];

  // keep track of used dref ids, to filter out unnecessary data refs
  const usedRefIds = {};

  requiredRefs.forEach((requiredRef) => {
    const exists = currentRefs.find(
      (currentRef) => currentRef.cid === requiredRef.cid && currentRef.path === requiredRef.path,
    );
    if (exists) usedRefIds[exists.id] = true;
    if (!exists) missingRefs.push(requiredRef);
  });

  const unusedRefs = currentRefs.filter((currentRef) => !(currentRef.id in usedRefIds));

  const totalMissingRefs = missingRefs.length;
  const totalUnusedRefs = unusedRefs.length;

  if (totalMissingRefs) {
    console.log(
      `[validateDataReferences] node id: ${node} is missing ${totalMissingRefs} data refs for the dataBucketCid: ${dataBucketCid}, missingRefs: ${JSON.stringify(
        missingRefs,
        null,
        2,
      )}`,
    );
    console.log('_______________________________________________________________________________________');
  }

  if (totalUnusedRefs) {
    console.log(
      `[validateDataReferences] node id: ${node} has ${totalUnusedRefs} unused data refs for the dataBucketCid: ${dataBucketCid}, unusedRefs: ${JSON.stringify(
        unusedRefs,
        null,
        2,
      )}`,
    );
    console.log('_______________________________________________________________________________________');
  }
  return { missingRefs, unusedRefs };
}

export async function validateAndHealDataRefs(nodeUuid: string, manifestCid: string, publicRefs: boolean) {
  const { missingRefs, unusedRefs } = await validateDataReferences(nodeUuid, manifestCid, publicRefs);
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
