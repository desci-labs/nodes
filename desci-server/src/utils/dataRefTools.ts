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

// export function validateDataReferences(dataBucketCid: string, nodeUuid: string, publicRefs: boolean) {

//     const node = await prisma.node.findFirst({
//         where: {
//           ownerId: owner.id,
//           uuid: uuid + '.',
//         },
//       });

//     const currentRefs = publicRefs ? createPublicDataRefs.findMany({where: {nodeUuid}})

//   const requiredRefs = getAllCidsRequiredForPublish(dataBucketCid, nodeUuid, undefined, undefined, undefined);
// }
