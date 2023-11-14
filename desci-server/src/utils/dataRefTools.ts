import { FileType, ResearchObjectV1, isNodeRoot, neutralizePath, recursiveFlattenTree } from '@desci-labs/desci-models';
import { DataReference, DataType, Prisma } from '@prisma/client';
import axios from 'axios';

import prisma from 'client';
import { PUBLIC_IPFS_PATH } from 'config';
import parentLogger from 'logger';
import { discoveryLs, getDirectoryTree } from 'services/ipfs';
import { objectPropertyXor, omitKeys } from 'utils';

import {
  generateExternalCidMap,
  generateManifestPathsToDbTypeMap,
  inheritComponentType,
  ExternalCidMap,
} from './driveUtils';

const logger = parentLogger.child({ module: 'Utils::DataRefTools' });

async function extractExternalCidMapFromTreeUrl(workingTreeUrl: string) {
  const res = await axios.get(workingTreeUrl);
  if (res.status !== 200) throw new Error(`Failed to get working tree from ${workingTreeUrl}`);

  const { tree } = res.data;
  const flatTree = recursiveFlattenTree(tree);
  const externalCidMap: ExternalCidMap = {};
  flatTree.forEach((entry) => {
    if (entry.external && entry.type === FileType.DIR) {
      externalCidMap[entry.cid] = {
        size: entry.size,
        path: entry.path,
        directory: true,
      };
    }
  });
  return externalCidMap;
}

interface GenerateDataReferencesArgs {
  nodeUuid: string;
  manifestCid: string;
  versionId?: number;
  markExternals?: boolean;
  workingTreeUrl?: string;
}

// generates data references for the contents of a manifest
export async function generateDataReferences({
  nodeUuid,
  manifestCid,
  versionId,
  markExternals,
  workingTreeUrl,
}: GenerateDataReferencesArgs): Promise<
  Prisma.DataReferenceCreateManyInput[] | Prisma.PublicDataReferenceCreateManyInput[]
> {
  nodeUuid = nodeUuid.endsWith('.') ? nodeUuid : nodeUuid + '.';
  const node = await prisma.node.findFirst({
    where: {
      uuid: nodeUuid,
    },
  });
  if (!node) throw new Error(`Node not found for uuid ${nodeUuid}`);
  const manifestEntry: ResearchObjectV1 = (await axios.get(`${PUBLIC_IPFS_PATH}/${manifestCid}`)).data;
  const dataBucketCid = manifestEntry.components.find((c) => isNodeRoot(c)).payload.cid;
  logger.info({ fn: 'generateDataReferences' }, `DATA BUCKET CID: ${dataBucketCid}`);
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

  const externalCidMap = workingTreeUrl
    ? await extractExternalCidMapFromTreeUrl(workingTreeUrl)
    : await generateExternalCidMap(node.uuid);
  let dataTree;
  if (markExternals) {
    dataTree = recursiveFlattenTree(await discoveryLs(dataBucketCid, externalCidMap));
  } else {
    dataTree = recursiveFlattenTree(await getDirectoryTree(dataBucketCid, externalCidMap, true, false));
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
      external: entry.external,
      // ...(!markExternals ? {} : entry.external ? { external: true } : { external: null }),
    };
  });

  return [dataRootEntry, ...dataTreeToPubRef];
}

// used to prepare data refs for a given dag and manifest (differs from generateDataReferences in that you don't need the updated manifestCid ahead of time)
export async function prepareDataRefs(
  nodeUuid: string,
  manifest: ResearchObjectV1,
  rootDagCid: string,
  markExternals = false,
  externalCidMapConcat?: ExternalCidMap, // adds externalCidMapConcat to the externalCidMap generated from the nodeUuid
): Promise<Prisma.DataReferenceCreateManyInput[] | Prisma.PublicDataReferenceCreateManyInput[]> {
  nodeUuid = nodeUuid.endsWith('.') ? nodeUuid : nodeUuid + '.';
  const node = await prisma.node.findFirst({
    where: {
      uuid: nodeUuid,
    },
  });
  if (!node) throw new Error(`Node not found for uuid ${nodeUuid}`);
  const manifestEntry: ResearchObjectV1 = manifest;
  const dataBucketCid = rootDagCid;

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
    ...(markExternals ? { external: null } : {}),
  };

  const externalCidMap = { ...(await generateExternalCidMap(node.uuid)), ...externalCidMapConcat };
  let dataTree = recursiveFlattenTree(await getDirectoryTree(dataBucketCid, externalCidMap, true, false));
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
      ...(!markExternals ? {} : entry.external ? { external: true } : { external: null }),
    };
  });

  return [dataRootEntry, ...dataTreeToPubRef];
}

export async function prepareDataRefsExternalCids(
  nodeUuid: string,
  manifest: ResearchObjectV1,
  rootDagCid: string,
  markExternals = false,
  externalCidMapConcat?: ExternalCidMap, // adds externalCidMapConcat to the externalCidMap generated from the nodeUuid
): Promise<Prisma.DataReferenceCreateManyInput[] | Prisma.PublicDataReferenceCreateManyInput[]> {
  nodeUuid = nodeUuid.endsWith('.') ? nodeUuid : nodeUuid + '.';
  const node = await prisma.node.findFirst({
    where: {
      uuid: nodeUuid,
    },
  });
  if (!node) throw new Error(`Node not found for uuid ${nodeUuid}`);
  const manifestEntry: ResearchObjectV1 = manifest;
  const dataBucketCid = rootDagCid;

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
    ...(markExternals ? { external: null } : {}),
  };

  const externalCidMap = { ...(await generateExternalCidMap(node.uuid)), ...externalCidMapConcat };
  const tree = await getDirectoryTree(dataBucketCid, externalCidMap, false);
  let dataTree;

  if (markExternals) {
    dataTree = recursiveFlattenTree(await discoveryLs(dataBucketCid, externalCidMap));
  } else {
    dataTree = recursiveFlattenTree(tree);
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

export async function validateDataReferences({
  nodeUuid,
  manifestCid,
  publicRefs,
  markExternals,
  txHash,
  workingTreeUrl,
}: ValidateAndHealDataRefsArgs) {
  if (nodeUuid.endsWith('.')) nodeUuid = nodeUuid.slice(0, -1);
  const node = await prisma.node.findFirst({
    where: {
      uuid: nodeUuid + '.',
    },
  });
  if (!node) throw new Error(`Node not found for uuid ${nodeUuid}`);
  if (!publicRefs) manifestCid = node.manifestUrl;

  const manifestEntry: ResearchObjectV1 = (await axios.get(`${PUBLIC_IPFS_PATH}/${manifestCid}`)).data;
  const dataBucketCid = manifestEntry.components.find((c) => isNodeRoot(c)).payload.cid;

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

  const requiredRefs = await generateDataReferences({
    nodeUuid,
    manifestCid,
    versionId,
    markExternals,
    workingTreeUrl,
  });

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
    logger.info(
      { fn: 'validateDataReferences' },
      `[validateDataReferences (MISSING)] node id: ${
        node.id
      } is missing ${totalMissingRefs} data refs for dataBucketCid: ${dataBucketCid}, missingRefs: ${JSON.stringify(
        missingRefs,
        null,
        2,
      )}`,
    );
    logger.debug('_______________________________________________________________________________________');
  }

  if (totalUnusedRefs) {
    logger.info(
      { fn: 'validateDataReferences' },
      `[validateDataReferences (UNUSED)] node id: ${
        node.id
      } has ${totalUnusedRefs} unused data refs for dataBucketCid: ${dataBucketCid}, unusedRefs: ${JSON.stringify(
        unusedRefs,
        null,
        2,
      )}`,
    );
    logger.debug('_______________________________________________________________________________________');
  }

  if (totalDiffRefs) {
    logger.info(
      { fn: 'validateDataReferences' },
      `[validateDataReferences (DIFF)] node id: ${
        node.id
      } has ${totalDiffRefs} refs with non matching props for dataBucketCid: ${dataBucketCid}, diffRefs: ${JSON.stringify(
        diffRefs,
        null,
        2,
      )}`,
    );
    logger.debug('_______________________________________________________________________________________');
  }
  return { missingRefs, unusedRefs, diffRefs };
}

interface ValidateAndHealDataRefsArgs {
  nodeUuid: string;
  manifestCid: string;
  publicRefs: boolean;
  markExternals?: boolean;
  txHash?: string;
  workingTreeUrl?: string;
}

export async function validateAndHealDataRefs({
  nodeUuid,
  manifestCid,
  publicRefs,
  markExternals,
  txHash,
  workingTreeUrl,
}: ValidateAndHealDataRefsArgs) {
  const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences({
    nodeUuid,
    manifestCid,
    publicRefs,
    markExternals,
    txHash,
    workingTreeUrl,
  });
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
    logger.info(
      { fn: 'validateAndHealDataRefs' },
      `[validateAndFixDataRefs (MISSING)] node id: ${nodeUuid}, added ${addedRefs.count} missing data refs`,
    );
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
    logger.info(
      { fn: 'validateAndHealDataRefs' },
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
    logger.info(
      { fn: 'validateAndHealDataRefs' },
      `[validateAndFixDataRefs (DIFF)] node id: ${nodeUuid}, healed ${updatedRefs.length} diff data refs`,
    );
  }
}
