import prisma from 'client';
import parentLogger from 'logger';
import { getManifestFromNode } from 'services/data/processing';
import { migrateIpfsTreeToNodeTree } from 'services/draftTrees';
import { client, getDirectoryTree } from 'services/ipfs';
import { dagifyAndAddDbTreeToIpfs, draftNodeTreeEntriesToFlatIpfsTree } from 'utils/draftTreeUtils';
import { generateExternalCidMap, generateManifestPathsToDbTypeMap, inheritComponentType } from 'utils/driveUtils';

const logger = parentLogger.child({ module: 'SCRIPTS::Testing' });

const rootCid = '';
const nodeUuid = 'SN-CfB9BXpWy7-AJj5as4FahLDaAMtRCeXCZXhCHiuo.';

async function benchmark() {
  const extCidMap = await generateExternalCidMap(nodeUuid, rootCid);

  await getDirectoryTree(rootCid, extCidMap);

  const node = await prisma.node.findUnique({ where: { uuid: nodeUuid } });

  const startTime = process.hrtime();
  const tree = await prisma.draftNodeTree.findMany({ where: { nodeId: node.id } });
  await draftNodeTreeEntriesToFlatIpfsTree(tree);
  const endTime = process.hrtime(startTime);
  logger.error(`DB Execution time: ${endTime[0]}s ${endTime[1] / 1000000}ms`);
}

// migrateIpfsTreeToNodeTree(nodeUuid);
// benchmark();

async function dbDraftTreeToIpfsTreeAndPin() {
  const node = await prisma.node.findUnique({ where: { uuid: nodeUuid } });

  const rootDagNode = await dagifyAndAddDbTreeToIpfs(node.id);

  if (rootDagNode) {
    logger.info(`DAG pinned: ${rootDagNode}`);
  } else {
    logger.error(`DAG pinning failed: rootDagNode is undefined or null`);
  }
}
// dbDraftTreeToIpfsTreeAndPin();

async function dbInheritanceFnTest() {
  const path = 'root/orange.txt';
  const path2 = 'root/test/ing.txt';
  const node = await prisma.node.findFirst({ where: { id: 57 } });
  const { manifest } = await getManifestFromNode(node);

  const pathToDbTypeMap = generateManifestPathsToDbTypeMap(manifest);
  const inheritedType = inheritComponentType(path, pathToDbTypeMap);
  const inheritedType2 = inheritComponentType(path2, pathToDbTypeMap);

  console.log(path, inheritedType);
  console.log(path2, inheritedType2);
}
dbInheritanceFnTest();
