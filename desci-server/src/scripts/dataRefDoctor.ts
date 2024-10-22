import { DataType, Prisma } from '@prisma/client';
import axios from 'axios';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { getSizeForCid } from '../services/ipfs.js';
import { getIndexedResearchObjects } from '../theGraph.js';
import { validateAndHealDataRefs, validateDataReferences } from '../utils/dataRefTools.js';
import { cleanupManifestUrl } from '../utils/manifest.js';
import { ensureUuidEndsWithDot, hexToCid } from '../utils.js';

/* 
Usage Guidelines:
- validate makes no changes, just outputs the validation results.
- heal will add missing refs, remove unused refs, and fix refs with a diff discrepancy.
- fillPublic will fill a nodes public data refs that is published on another nodes environment, under the USER_EMAIL provided.
- PUBLIC_REFS is an optional flag, if true, it will fix public refs.
- START and END are optional flags, if set, it will only process nodes within the range.
- MARK_EXTERNALS is an optional flag, if true, it will mark external refs as external, downside is that it can take significantly longer to process, also size diff checking disabled when marking externals.
- TX_HASH is an optional param, used for fixing node version of a specific published node version. (Edgecase of multiple publishes with same manifestCid)
- COMMIT_ID is an optional param, used for fixing node version of a specific published node version.
- USER_EMAIL is only required for the fillPublic operation
- WORKING_TREE_URL is only required for the fillPublic operation, useful if a node is known to contain external cids, it can cut down the backfill time significantly for dags with external cids.

Operation Types [validate, heal, validateAll, healAll]

Usage Examples:
validate:         OPERATION=validate NODE_UUID=noDeUuiD. MANIFEST_CID=bafkabc123 PUBLIC_REFS=true npm run script:fix-data-refs
heal:             OPERATION=heal NODE_UUID=noDeUuiD. MANIFEST_CID=bafkabc123 PUBLIC_REFS=true npm run script:fix-data-refs
validateAll:      OPERATION=validateAll PUBLIC_REFS=true npm run script:fix-data-refs
healAll:          OPERATION=healAll PUBLIC_REFS=true npm run script:fix-data-refs
fillPublic:       OPERATION=fillPublic USER_EMAIL=noreply@desci.com NODE_UUID=noDeUuiD. npm run script:fix-data-refs
clonePrivateNode: OPERATION=clonePrivateNode NODE_UUID=noDeUuiD. NEW_NODE_UUID=nEwnoDeUuiD2. npm run script:fix-data-refs

Heal external flag in refs:
healAll:      OPERATION=healAll PUBLIC_REFS=true MARK_EXTERNALS=true npm run script:fix-data-refs
 */

const logger = parentLogger.child({ module: 'SCRIPTS::dataRefDoctor' });

main();
async function main() {
  const {
    operation,
    nodeUuid,
    manifestCid,
    publicRefs,
    start,
    end,
    markExternals,
    txHash,
    commitId,
    userEmail,
    workingTreeUrl,
    newNodeUuid,
  } = getOperationEnvs();
  const startIterator = isNaN(start as any) ? undefined : parseInt(start);
  const endIterator = isNaN(end as any) ? undefined : parseInt(end);
  switch (operation) {
    case 'validate':
      if (!nodeUuid && !manifestCid) return logger.error('Missing NODE_UUID or MANIFEST_CID');
      await validateDataReferences({ nodeUuid, manifestCid, publicRefs, markExternals, txHash, commitId });
      break;
    case 'heal':
      if (!nodeUuid && !manifestCid) return logger.error('Missing NODE_UUID or MANIFEST_CID');
      await validateAndHealDataRefs({ nodeUuid, manifestCid, publicRefs, markExternals, txHash, commitId });
      break;
    case 'validateAll':
      await dataRefDoctor({ heal: false, publicRefs, start: startIterator, end: endIterator, markExternals });
      break;
    case 'healAll':
      await dataRefDoctor({ heal: true, publicRefs, start: startIterator, end: endIterator, markExternals });
      break;
    case 'fillPublic':
      if (!nodeUuid && !userEmail) return logger.error('Missing NODE_UUID or USER_EMAIL');
      await fillPublic(nodeUuid, userEmail, workingTreeUrl);
      break;
    case 'clonePrivateNode':
      if (!nodeUuid && !newNodeUuid) return logger.error('Missing NODE_UUID or NEW_NODE_UUID');
      await clonePrivateNode(nodeUuid, newNodeUuid);
      break;
    default:
      logger.error('Invalid operation, valid operations include: validate, heal, validateAll, healAll');
      return;
  }
  logger.info('DataRefDr has finished running');
  process.exit(0);
}

function getOperationEnvs() {
  return {
    operation: process.env.OPERATION || null,
    nodeUuid: process.env.NODE_UUID || null,
    newNodeUuid: process.env.NEW_NODE_UUID || null,
    manifestCid: process.env.MANIFEST_CID || null,
    publicRefs: process.env.PUBLIC_REFS?.toLowerCase() === 'true' ? true : false,
    start: process.env.START,
    end: process.env.END,
    markExternals: process.env.MARK_EXTERNALS?.toLowerCase() === 'true' ? true : false,
    txHash: process.env.TX_HASH || null,
    commitId: process.env.COMMIT_ID || null,
    workingTreeUrl: process.env.WORKING_TREE_URL || null,
    userEmail: process.env.USER_EMAIL || null,
  };
}

type DataRefDoctorArgs = {
  heal: boolean;
  publicRefs: boolean;
  start?: number;
  end?: number;
  markExternals?: boolean;
};

//todo: add public handling
async function dataRefDoctor({ heal, publicRefs, start, end, markExternals }: DataRefDoctorArgs) {
  const nodes = await prisma.node.findMany({
    orderBy: {
      id: 'asc',
    },
  });
  logger.info(`[DataRefDoctor]Nodes found: ${nodes.length}`);

  const startIdx = start || 0;
  const endIdx = end || nodes.length;

  for (let i = startIdx; i < endIdx; i++) {
    try {
      logger.info(`[DataRefDoctor]Processing node: ${nodes[i].id}`);
      const node = nodes[i];

      if (publicRefs) {
        const { researchObjects } = await getIndexedResearchObjects([node.uuid]);
        if (!researchObjects.length) continue;
        const indexedNode = researchObjects[0];
        const totalVersionsIndexed = indexedNode.versions.length || 0;
        if (!totalVersionsIndexed) continue;
        logger.info(
          `[DataRefDoctor]Processing node: ${nodes[i].id}, found versions indexed: ${totalVersionsIndexed}, for nodeUuid: ${node.uuid}`,
        );
        for (let nodeVersIdx = 0; nodeVersIdx < totalVersionsIndexed; nodeVersIdx++) {
          const hexCid = indexedNode.versions[nodeVersIdx]?.cid || indexedNode.recentCid;
          const txHash = indexedNode.versions[nodeVersIdx]?.id;
          const commitId = indexedNode.versions[nodeVersIdx]?.commitId;
          const publishIdentifier = commitId || txHash;

          logger.info(
            `[DataRefDoctor]Processing indexed version: ${nodeVersIdx}, with publishIdentifier: ${publishIdentifier}`,
          );
          const manifestCid = hexToCid(hexCid);
          if (heal) {
            await validateAndHealDataRefs({
              nodeUuid: node.uuid,
              manifestCid,
              publicRefs: true,
              markExternals,
              txHash,
              commitId,
              includeManifestRef: true,
            });
          } else {
            validateDataReferences({
              nodeUuid: node.uuid,
              manifestCid,
              publicRefs: true,
              markExternals,
              txHash,
              commitId,
              includeManifestRef: true,
            });
          }
        }
      }
      if (!publicRefs) {
        if (heal) {
          await validateAndHealDataRefs({
            nodeUuid: node.uuid,
            manifestCid: node.manifestUrl,
            publicRefs: false,
            markExternals,
            includeManifestRef: true,
          });
        } else {
          await validateDataReferences({
            nodeUuid: node.uuid,
            manifestCid: node.manifestUrl,
            publicRefs: false,
            markExternals,
            includeManifestRef: true,
          });
        }
      }
    } catch (e) {
      logger.error({ error: e, node: nodes[i] }, `[DataRefDoctor]Error processing node: ${nodes[i].id}`);
    }
  }
}

async function fillPublic(nodeUuid: string, userEmail: string, workingTreeUrl?: string) {
  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) return logger.error(`[FillPublic] Failed to find user with email: ${userEmail}`);

  nodeUuid = ensureUuidEndsWithDot(nodeUuid);
  const { researchObjects } = await getIndexedResearchObjects([nodeUuid]);
  if (!researchObjects.length) {
    logger.error(
      { nodeUuid, researchObjects },
      `[FillPublic] Failed to resolve any published nodes with the uuid: ${nodeUuid}, aborting script`,
    );
    return;
  }

  const indexedNode = researchObjects[0];
  const latestHexCid = indexedNode.recentCid;
  const latestManifestCid = hexToCid(latestHexCid);
  const manifestUrl = cleanupManifestUrl(latestManifestCid);
  const latestManifest = await (await axios.get(manifestUrl)).data;

  if (!latestManifest) {
    logger.error(
      { manifestUrl, latestManifestCid },
      `[FillPublic] Failed to retrieve manifest from ipfs cid: ${latestManifestCid}, aborting script`,
    );
    return;
  }

  const title = '[IMPORTED NODE]' + latestManifest.title || 'Imported Node';
  let node = await prisma.node.findUnique({ where: { uuid: nodeUuid } });
  if (!node) {
    node = await prisma.node.create({
      data: {
        title,
        uuid: nodeUuid,
        manifestUrl: latestManifestCid,
        replicationFactor: 0,
        restBody: {},
        ownerId: user.id,
      },
    });
  }

  const totalVersionsIndexed = indexedNode.versions.length || 0;
  try {
    for (let nodeVersIdx = 0; nodeVersIdx < totalVersionsIndexed; nodeVersIdx++) {
      const hexCid = indexedNode.versions[nodeVersIdx]?.cid || indexedNode.recentCid;
      const txHash = indexedNode.versions[nodeVersIdx]?.id;
      const commitId = indexedNode.versions[nodeVersIdx]?.commitId;
      const commitIdOrTxHash = commitId || txHash;

      logger.info(
        `[DataRefDoctor]Processing indexed version: ${nodeVersIdx}, with ${commitId ? 'commitId:' : 'txHash'}: ${commitIdOrTxHash}`,
      );
      const manifestCid = hexToCid(hexCid);

      const nodeVersionPublishIdentifiers = {
        ...(txHash && { transactionId: txHash }),
        ...(commitId && { commitId }),
      };

      const nodeVersion = await prisma.nodeVersion.create({
        data: {
          nodeId: node.id,
          manifestUrl: manifestCid,
          ...nodeVersionPublishIdentifiers,
        },
      });

      //create pub dref entry for the manifest
      const manifestEntry: Prisma.PublicDataReferenceCreateManyInput = {
        cid: manifestCid,
        userId: node.ownerId,
        root: false,
        directory: false,
        size: await getSizeForCid(manifestCid, false),
        type: DataType.MANIFEST,
        nodeId: node.id,
        versionId: nodeVersion.id,
      };
      logger.info(
        { manifestEntry },
        `[DataRefDoctor] Manifest entry being created for indexed version ${nodeVersIdx}, with publishIdentifier: ${commitIdOrTxHash}`,
      );
      await prisma.publicDataReference.create({ data: manifestEntry });

      //generate pub drefs for the bucket
      await validateAndHealDataRefs({
        nodeUuid: node.uuid,
        manifestCid,
        publicRefs: true,
        txHash,
        commitId,
        workingTreeUrl,
      });
      logger.info(
        `[DataRefDoctor]Successfully processed indexed node v: ${nodeVersIdx}, with publishIdentifier: ${commitIdOrTxHash}, under user: ${user.email}`,
      );
    }
    logger.info(`[FillPublic] Successfully backfilled data refs for public node: ${nodeUuid}`);
  } catch (e) {
    logger.error(
      {
        err: e,
        nodeUuid,
        latestHexCid,
        latestManifestCid,
        userEmail,
        manifestUrl,
        latestManifest,
        totalVersionsIndexed,
        indexedNode,
      },
      `[FillPublic] Failed to backfill data refs for public node: ${nodeUuid}`,
    );
  }
}

async function clonePrivateNode(nodeUuid: string, newNodeUuid: string) {
  // find new node, get associated user
  logger.info({ nodeUuid, newNodeUuid }, '[clonePrivateNode] Cloning node started');

  if (!nodeUuid.endsWith('.')) nodeUuid += '.';
  if (!newNodeUuid.endsWith('.')) newNodeUuid += '.';

  const oldNode = await prisma.node.findUnique({ where: { uuid: nodeUuid } });
  const newNode = await prisma.node.findUnique({ where: { uuid: newNodeUuid } });
  if (!oldNode) return logger.error(`[clonePrivateNode] Failed to find new node with uuid: ${nodeUuid}`);
  if (!newNode) return logger.error(`[clonePrivateNode] Failed to find new node with uuid: ${newNodeUuid}`);

  const newNodeUser = await prisma.user.findUnique({ where: { id: newNode.ownerId } });
  if (!newNodeUser) return logger.error(`[clonePrivateNode] Failed to find userid: ${newNode.ownerId}`);

  // clone node state
  const newNodeObj = {
    ...oldNode,
    uuid: newNodeUuid,
    ownerId: newNodeUser.id,
    id: newNode.id,
  };

  const updatedNode = await prisma.node.update({
    where: {
      id: newNode.id,
    },
    data: newNodeObj,
  });

  if (!updatedNode) {
    return logger.error(`[clonePrivateNode] Failed to clone old node state to new node: ${newNodeUuid}`);
  }
  logger.info('[clonePrivateNode] Successfully cloned node state');

  // clone refs
  logger.info('[clonePrivateNode] Cloning data refs...');
  const oldNodeDataRefs = await prisma.dataReference.findMany({ where: { nodeId: oldNode.id } });
  if (!oldNodeDataRefs.length)
    return logger.error({ oldNodeDataRefs }, `[clonePrivateNode] Failed to find data refs for node: ${nodeUuid}`);

  const newNodeDataRefs = oldNodeDataRefs.map((ref) => {
    delete ref.id;
    return {
      ...ref,
      nodeId: newNode.id,
      userId: newNodeUser.id,
    };
  });

  const createdDataRefs = await prisma.dataReference.createMany({ data: newNodeDataRefs });

  if (!createdDataRefs.count)
    return logger.error({ createdDataRefs }, `[clonePrivateNode] Failed to create data refs for: ${newNodeUuid}`);

  logger.info('[clonePrivateNode] Successfully cloned data refs');
  logger.info(`[clonePrivateNode] Successfully cloned private node ${nodeUuid} to ${newNodeUuid}`);
}
