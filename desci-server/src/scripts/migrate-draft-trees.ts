import readline from 'readline';

import prisma from 'client';
import parentLogger from 'logger';
import { migrateIpfsTreeToNodeTree } from 'services/draftTrees';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const logger = parentLogger.child({
  module: 'Script::MigrateDraftTrees',
});

/**
 * GUIDE:
 * To migrate all nodes simply run
 ***** npm run script:migrate-draft-trees
 *
 * To migrate a subset of nodes, you can add in START and END environment variables, e.g.
 ***** START=0 END=100 npm run script:migrate-draft-trees
 * this will run it across the first 100 nodes in the db
 *
 * To migrate a single node, you can add in NODE_ID environment variable, e.g.
 ***** NODE_ID=70 npm run script:migrate-draft-trees
 */

entry();
function entry() {
  const nodeId = process.env.NODE_ID ? parseInt(process.env.NODE_ID) : null;
  if (nodeId) {
    migrateDraftTree(nodeId);
  } else {
    migrateDraftTrees();
  }
}

async function migrateDraftTrees() {
  // Parse start/end environment vars
  const start = process.env.START ? parseInt(process.env.START) : null;
  const end = process.env.END ? parseInt(process.env.END) : null;

  const whereCondition = {};
  if (start !== null) {
    whereCondition['id'] = { gte: start };
  }
  if (end !== null) {
    whereCondition['id'] = { ...whereCondition['id'], lte: end };
  }

  logger.info(whereCondition);
  // Get all nodes within the params
  const nodes = await prisma.node.findMany({
    where: whereCondition,
    orderBy: {
      id: 'asc',
    },
  });

  // Loop through each node
  let idx = 1;
  const totalNodes = nodes.length;
  const failedUpgradeNodeIds = [];
  const skippedUpgradeNodeIds = [];
  for (const node of nodes) {
    logger.info(`[${idx}/${totalNodes}] Migrating node ${node.uuid} , nodeId: ${node.id}`);
    idx++;
    try {
      const draftNodeTreeEntries = await prisma.draftNodeTree.findMany({ where: { nodeId: node.id } });
      if (draftNodeTreeEntries.length > 0) {
        skippedUpgradeNodeIds.push(node.id);
        logger.error(
          `Node ${node.uuid} , nodeId: ${node.id} has draft tree entries detected, skipping migration, manually review`,
        );
      } else {
        await migrateIpfsTreeToNodeTree(node.uuid);
      }
    } catch (error) {
      logger.error({ error, node }, `Failed to migrate node ${node.uuid} , nodeId: ${node.id}`);
      failedUpgradeNodeIds.push(node.id);
    }
  }
  const successCount = totalNodes - failedUpgradeNodeIds.length - skippedUpgradeNodeIds.length;
  const failCount = failedUpgradeNodeIds.length;
  const skipCount = skippedUpgradeNodeIds.length;

  logger.info(
    { failedUpgradeNodeIds, skippedUpgradeNodeIds, startParam: start, endParam: end },
    `Tree migration ran on ${totalNodes}, ${successCount} successful migrations, ${failCount} failed migrations, ${skipCount} skipped migrations`,
  );
  cleanUpAndExit();
}

async function migrateDraftTree(nodeId: number) {
  try {
    const draftNodeTreeEntries = await prisma.draftNodeTree.findMany({ where: { nodeId } });
    const node = await prisma.node.findUnique({ where: { id: nodeId } });

    const handleUserInput = async (resolve, reject) => {
      if (draftNodeTreeEntries.length > 0) {
        rl.question(
          `Node ${nodeId} has draft tree entries detected, are you sure you want to continue? (Y/N) `,
          async (answer) => {
            if (answer.toLowerCase() === 'y') {
              console.log('continuing...');
              await migrateIpfsTreeToNodeTree(node.uuid);
              resolve();
            } else {
              console.log('Exiting');
              reject(new Error('User chose not to continue'));
            }
          },
        );
      } else {
        await migrateIpfsTreeToNodeTree(node.uuid);
        resolve();
      }
    };

    // Wait for user input if needed
    await new Promise(handleUserInput);
  } catch (error) {
    logger.error({ error, nodeId }, `Failed to migrate node ${nodeId}`);
  }
  cleanUpAndExit();
}

function cleanUpAndExit() {
  rl.close();
  process.exit(0);
}
