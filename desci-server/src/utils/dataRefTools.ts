import { ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { DataReference, DataType, Prisma } from '@prisma/client';
import axios from 'axios';

import prisma from 'client';
import { PUBLIC_IPFS_PATH } from 'config';
import { CidSource, discoveryLs, getDirectoryTree } from 'services/ipfs';
import { objectPropertyXor, omitKeys } from 'utils';

import {
  generateExternalCidMap,
  recursiveFlattenTree,
  generateManifestPathsToDbTypeMap,
  neutralizePath,
  inheritComponentType,
} from './driveUtils';

// generates data references for the contents of a manifest
export async function generateDataReferences(
  nodeUuid: string,
  manifestCid: string,
  versionId?: number,
  markExternals = false,
): Promise<Prisma.DataReferenceCreateManyInput[] | Prisma.PublicDataReferenceCreateManyInput[]> {
  nodeUuid = nodeUuid.endsWith('.') ? nodeUuid : nodeUuid + '.';
  const node = await prisma.node.findFirst({
    where: {
      uuid: nodeUuid,
    },
  });
  if (!node) throw new Error(`Node not found for uuid ${nodeUuid}`);
  const manifestEntry: ResearchObjectV1 = (await axios.get(`${PUBLIC_IPFS_PATH}/${manifestCid}`)).data;
  const dataBucketCid = manifestEntry.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload
    .cid;
  console.log('DATA BUCKET CID: ', dataBucketCid);
  const dataRootEntry: Prisma.DataReferenceCreateManyInput = {
    cid: dataBucketCid,
    path: dataBucketCid,
    userId: node.ownerId,
    root: true,
    rootCid: dataBucketCid,
    directory: true,
    size: 0,
    type: DataType.DATA_BUCKET,
    nodeId: node.id,
    ...(versionId ? { versionId } : {}),
    ...(markExternals ? { external: null } : {}),
  };

  const externalCidMap = await generateExternalCidMap(node.uuid);
  let dataTree = recursiveFlattenTree(await getDirectoryTree(dataBucketCid, externalCidMap));
  if (markExternals) {
    dataTree = recursiveFlattenTree(await discoveryLs(dataBucketCid, externalCidMap));
  }
  const manifestPathsToDbTypes = generateManifestPathsToDbTypeMap(manifestEntry);

  const dataTreeToPubRef: Prisma.DataReferenceCreateManyInput[] = dataTree.map((entry) => {
    const neutralPath = neutralizePath(entry.path);
    const dbType = inheritComponentType(neutralPath, manifestPathsToDbTypes);
    return {
      cid: entry.cid,
      path: entry.path,
      userId: node.ownerId,
      rootCid: dataBucketCid,
      root: false,
      directory: entry.type === 'dir',
      size: entry.size,
      type: dbType,
      nodeId: node.id,
      ...(versionId ? { versionId } : {}),
      ...(!markExternals ? {} : entry.external ? { external: true } : { external: null }),
    };
  });

  return [dataRootEntry, ...dataTreeToPubRef];
}

interface DataReferenceDiff {
  currentRef: Partial<DataReference>;
  requiredRef: Partial<DataReference>;
}

interface DiffObject {
  [refDbId: string]: DataReferenceDiff;
}

// generateDataReferences() refs won't contain these keys, they will be omitted from the diff.
const DIFF_EXCLUSION_KEYS = ['id', 'createdAt', 'updatedAt', 'name', 'description'];

export async function validateDataReferences(
  nodeUuid: string,
  manifestCid: string,
  publicRefs: boolean,
  markExternals = false,
  txHash?: string,
) {
  if (nodeUuid.endsWith('.')) nodeUuid = nodeUuid.slice(0, -1);
  const node = await prisma.node.findFirst({
    where: {
      uuid: nodeUuid + '.',
    },
  });
  if (!node) throw new Error(`Node not found for uuid ${nodeUuid}`);
  if (!publicRefs) manifestCid = node.manifestUrl;

  const manifestEntry: ResearchObjectV1 = (await axios.get(`${PUBLIC_IPFS_PATH}/${manifestCid}`)).data;
  const dataBucketCid = manifestEntry.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload
    .cid;

  const versionId = publicRefs
    ? (
        await prisma.nodeVersion.findFirst({
          where: {
            nodeId: node.id,
            manifestUrl: manifestCid,
            ...(txHash && { transactionId: txHash }),
          },
        })
      ).id
    : undefined;

  const currentRefs = publicRefs
    ? await prisma.publicDataReference.findMany({
        where: { nodeId: node.id, type: { not: DataType.MANIFEST }, versionId },
      })
    : await prisma.dataReference.findMany({ where: { nodeId: node.id, type: { not: DataType.MANIFEST } } });

  const requiredRefs = await generateDataReferences(nodeUuid, manifestCid, versionId, markExternals);

  const missingRefs = [];
  const diffRefs: DiffObject = {};

  // keep track of used dref ids, to filter out unnecessary data refs
  const usedRefIds = {};

  // NOTE: size diff checking disabled if marking externals
  const diffExclusionKeys = [
    ...DIFF_EXCLUSION_KEYS,
    ...(publicRefs ? [] : ['versionId']),
    ...(markExternals ? ['size'] : ['external']),
  ];

  requiredRefs.forEach((requiredRef) => {
    const exists = currentRefs.find(
      (currentRef) => currentRef.cid === requiredRef.cid && currentRef.path === requiredRef.path,
    );

    if (exists) {
      // checks if theres a diff between the two refs
      const filteredCurrentRef = omitKeys(exists, diffExclusionKeys);
      const diffKeys = objectPropertyXor(requiredRef, filteredCurrentRef);
      Object.keys(diffKeys).forEach((key) => {
        if (diffExclusionKeys.includes(key)) delete diffKeys[key];
      });
      const currentRefProps = {};
      const requiredRefProps = {};
      Object.keys(diffKeys).forEach((key) => {
        if (key in filteredCurrentRef) {
          currentRefProps[key] = filteredCurrentRef[key];
        } else {
          currentRefProps[key] = undefined;
        }
        if (key in requiredRef) {
          requiredRefProps[key] = requiredRef[key];
        } else {
          requiredRefProps[key] = undefined;
        }
      });
      if (Object.keys(diffKeys).length) {
        diffRefs[exists.id] = { currentRef: currentRefProps, requiredRef: requiredRefProps };
      }
      // ref consumed, don't add to unused refs
      usedRefIds[exists.id] = true;
    }
    if (!exists) missingRefs.push(requiredRef);
  });

  const unusedRefs = currentRefs.filter((currentRef) => !(currentRef.id in usedRefIds));

  const totalMissingRefs = missingRefs.length;
  const totalUnusedRefs = unusedRefs.length;
  const totalDiffRefs = Object.keys(diffRefs).length;

  if (totalMissingRefs) {
    console.log(
      `[validateDataReferences (MISSING)] node id: ${
        node.id
      } is missing ${totalMissingRefs} data refs for dataBucketCid: ${dataBucketCid}, missingRefs: ${JSON.stringify(
        missingRefs,
        null,
        2,
      )}`,
    );
    console.log('_______________________________________________________________________________________');
  }

  if (totalUnusedRefs) {
    console.log(
      `[validateDataReferences (UNUSED)] node id: ${
        node.id
      } has ${totalUnusedRefs} unused data refs for dataBucketCid: ${dataBucketCid}, unusedRefs: ${JSON.stringify(
        unusedRefs,
        null,
        2,
      )}`,
    );
    console.log('_______________________________________________________________________________________');
  }

  if (totalDiffRefs) {
    console.log(
      `[validateDataReferences (DIFF)] node id: ${
        node.id
      } has ${totalDiffRefs} refs with non matching props for dataBucketCid: ${dataBucketCid}, diffRefs: ${JSON.stringify(
        diffRefs,
        null,
        2,
      )}`,
    );
    console.log('_______________________________________________________________________________________');
  }
  return { missingRefs, unusedRefs, diffRefs };
}

export async function validateAndHealDataRefs(
  nodeUuid: string,
  manifestCid: string,
  publicRefs: boolean,
  markExternals = false,
  txHash?: string,
) {
  const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences(
    nodeUuid,
    manifestCid,
    publicRefs,
    markExternals,
    txHash,
  );
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
    console.log(`[validateAndFixDataRefs (MISSING)] node id: ${nodeUuid}, added ${addedRefs.count} missing data refs`);
  }
  if (unusedRefs.length) {
    const unusedRefIds = unusedRefs.map((ref) => ref.id);
    const deletedRefs = publicRefs
      ? await prisma.publicDataReference.deleteMany({
          where: { id: { in: unusedRefIds } },
        })
      : await prisma.dataReference.deleteMany({
          where: { id: { in: unusedRefIds } },
        });
    console.log(
      `[validateAndFixDataRefs (UNUSED)] node id: ${nodeUuid}, deleted ${deletedRefs.count} unused data refs`,
    );
  }

  if (Object.keys(diffRefs).length) {
    const updatedRefs = Object.keys(diffRefs).map(async (refId) => {
      const updateOp = { where: { id: parseInt(refId) }, data: diffRefs[refId].requiredRef };
      return publicRefs
        ? await prisma.publicDataReference.update(updateOp)
        : await prisma.dataReference.update(updateOp);
    });
    console.log(`[validateAndFixDataRefs (DIFF)] node id: ${nodeUuid}, healed ${updatedRefs.length} diff data refs`);
  }
}
