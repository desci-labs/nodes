import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { ActionType, Node, Prisma, PublishTaskQueue, PublishTaskQueueStatus, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { stdSerializers } from 'pino';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { delFromCache } from '../../redisClient.js';
import { attestationService } from '../../services/Attestation.js';
import { directStreamLookup } from '../../services/ceramic.js';
import { getManifestByCid } from '../../services/data/processing.js';
import { ElasticNodesService } from '../../services/ElasticNodesService.js';
import { getTargetDpidUrl } from '../../services/fixDpid.js';
import { doiService } from '../../services/index.js';
import { saveInteraction, saveInteractionWithoutReq } from '../../services/interactionLog.js';
import {
  cacheNodeMetadata,
  getAllCidsRequiredForPublish,
  createPublicDataRefs,
  setCeramicStream,
  setDpidAlias,
} from '../../services/nodeManager.js';
import { emitNotificationOnPublish } from '../../services/NotificationService.js';
import { PublishServices } from '../../services/PublishServices.js';
import { _getIndexedResearchObjects, getIndexedResearchObjects } from '../../theGraph.js';
import { DiscordChannel, discordNotify, DiscordNotifyType } from '../../utils/discordUtils.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

import { getOrCreateDpid, upgradeDpid } from './createDpid.js';

export type PublishReqBody = {
  uuid: string;
  cid: string;
  manifest: ResearchObjectV1;
  transactionId: string;
  ceramicStream?: string;
  commitId?: string;
  useNewPublish: boolean;
  mintDoi: boolean;
};

export type PublishRequest = Request<never, never, PublishReqBody> & {
  user: User; // added by auth middleware
};

export type PublishResBody =
  | {
      ok: boolean;
      dpid: number;
      taskId?: number;
    }
  | {
      error: string;
    };

export const publish = async (req: PublishRequest, res: Response<PublishResBody>, _next: NextFunction) => {
  const { uuid, cid, manifest, transactionId, ceramicStream, commitId, useNewPublish, mintDoi } = req.body;
  const email = req.user.email;
  const owner = req.user;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::publishController',
    body: req.body,
    uuid,
    cid,
    transactionId,
    ceramicStream,
    commitId,
    email,
    user: owner,
    useNewPublish,
  });

  if (!uuid || !cid || !manifest) {
    return res.status(404).send({ error: 'uuid, cid, email, and manifest must be valid' });
  }

  if (!(ceramicStream && commitId)) {
    logger.warn({ uuid }, `[publish] called with unexpected stream (${ceramicStream}) and/org commit (${commitId})`);
  }

  try {
    const node = await prisma.node.findFirst({
      where: {
        ownerId: owner.id,
        uuid: ensureUuidEndsWithDot(uuid),
      },
    });

    if (!node) {
      logger.warn({ owner, uuid }, `unauthed node user: ${owner}, node uuid provided: ${uuid}`);
      return res.status(400).json({ error: 'failed' });
    }

    // Check if there is already an ongoing publish job in the queue
    const task = await prisma.publishTaskQueue.findFirst({
      where: { uuid: ensureUuidEndsWithDot(uuid), status: { not: PublishTaskQueueStatus.FAILED } },
    });

    if (task) return res.status(400).json({ error: 'Node publishing in progress' });

    /*
     ** Add PublishStatus entry
     */
    const publishStatusEntry = await PublishServices.createPublishStatusEntry(uuid);
    await PublishServices.updatePublishStatusEntry({
      publishStatusId: publishStatusEntry.id,
      data: {
        commitId: commitId,
        manifestCid: cid, // Ideally extracted from the stream commit, so we know they align
        ceramicCommit: true,
      },
    });

    logger.info({ ceramicStream, commitId, uuid, owner: owner.id }, 'Triggering new publish flow');
    const dpidAlias = await syncPublish(
      ceramicStream,
      commitId,
      node,
      owner,
      cid,
      uuid,
      manifest,
      publishStatusEntry.id,
    );

    PublishServices.updateAssociatedAttestations(
      node.uuid,
      dpidAlias ? dpidAlias.toString() : manifest.dpid?.id,
      publishStatusEntry.id,
    );

    await PublishServices.transformDraftComments({
      node,
      owner,
      dpidAlias: dpidAlias ? dpidAlias : manifest.dpid?.id ? parseInt(manifest.dpid.id) : undefined,
      publishStatusId: publishStatusEntry.id,
    });

    // Make sure we don't serve stale manifest state when a publish is happening
    delFromCache(`node-draft-${ensureUuidEndsWithDot(node.uuid)}`);

    saveInteraction(
      req,
      ActionType.PUBLISH_NODE,
      {
        cid,
        dpid: dpidAlias?.toString() ?? manifest.dpid?.id,
        userId: owner.id,
        transactionId,
        ceramicStream,
        commitId,
        uuid: ensureUuidEndsWithDot(uuid),
        outcome: 'SUCCESS',
      },
      owner.id,
    );

    if (mintDoi) {
      // trigger doi minting workflow
      try {
        const submission = await doiService.autoMintTrigger(node.uuid);
        const targetDpidUrl = getTargetDpidUrl();
        discordNotify({
          channel: DiscordChannel.DoiMinting,
          type: DiscordNotifyType.INFO,
          title: 'Mint DOI',
          message: `${targetDpidUrl}/${submission.dpid} sent a request to mint: ${submission.uniqueDoi}`,
        });
        await PublishServices.updatePublishStatusEntry({
          publishStatusId: publishStatusEntry.id,
          data: {
            triggerDoiMint: true,
          },
        });
      } catch (err) {
        logger.error({ err }, 'Error:  Mint DOI on Publish');
        await PublishServices.updatePublishStatusEntry({
          publishStatusId: publishStatusEntry.id,
          data: {
            triggerDoiMint: false,
          },
        });
      }
    }

    res.send({
      ok: true,
      dpid: dpidAlias ?? parseInt(manifest.dpid?.id),
    });

    // Index on ES
    try {
      ElasticNodesService.indexResearchObject(node.uuid);
    } catch (err) {
      logger.error({ err }, 'Error: Indexing published node in ElasticSearch failed');
    }
  } catch (err) {
    logger.error({ err }, '[publish::publish] node-publish-err');
    saveInteraction(req, ActionType.PUBLISH_NODE, {
      cid,
      user: req.user,
      transactionId,
      ceramicStream,
      commitId,
      uuid: ensureUuidEndsWithDot(uuid),
      outcome: 'FAILURE',
      err: stdSerializers.errWithCause(err as Error),
    });
    return res.status(400).send({ ok: false, error: err.message });
  }
};

/**
 * Synchronously perform publish steps before returning.
 *
 * This is generally fast because the ceramic update is already done,
 * but two cases are a bit slower:
 * 1. first time publish (wait on backend tx)
 * 2. dpid upgrade (wait on backend tx)
 *
 * Semantically, these can both be made fire-and-forget promises if we can
 * manage without instantly having the dPID alias available in this function.
 *
 * @returns dpidAlias
 */
const syncPublish = async (
  ceramicStream: string,
  commitId: string,
  node: Node,
  owner: User,
  cid: string,
  uuid: string,
  manifest: ResearchObjectV1,
  publishStatusId: number,
): Promise<number> => {
  const logger = parentLogger.child({
    module: 'NODE::syncPublish',
    uuid,
    cid,
    ceramicStream,
    commitId,
  });

  const nodeVersion = await PublishServices.updateNodeVersionEntry({
    manifestCid: cid,
    commitId,
    node,
    publishStatusId,
  });

  // first time we see a stream for this node, make sure we bind it in the db
  if (!node.ceramicStream) {
    logger.trace(`[publish:publish] setting streamID ${ceramicStream} on node ${uuid}`);
    await setCeramicStream(uuid, ceramicStream);
  } else if (node.ceramicStream !== ceramicStream) {
    logger.warn(
      { database: node.ceramicStream, ceramicStream },
      // This is unexpected and weird, but important to know if it occurs
      `[publish:publish] stream on record does not match passed streamID`,
    );
  }

  const legacyDpid = manifest.dpid?.id ? parseInt(manifest.dpid.id) : undefined;
  let dpidAlias: number = node.dpidAlias;

  // Do dataRef and dPID registration operations concurrently
  const promises = [];

  if (!dpidAlias) {
    // The only reason this isn't just fire-and-forget is that we want the dpid
    // for the discord notification, which won't be available otherwise for
    // first time publishes.
    promises.push(
      createOrUpgradeDpidAlias(legacyDpid, ceramicStream, uuid, publishStatusId).then((dpid) => (dpidAlias = dpid)),
    );
  }

  promises.push(
    // Make sure artifacts are resolvable on public IPFS node
    handlePublicDataRefs({
      nodeId: node.id,
      userId: owner.id,
      manifestCid: cid,
      nodeVersionId: nodeVersion.id,
      nodeUuid: node.uuid,
      publishStatusId,
    }),
  );

  await Promise.all(promises);

  const dpid = dpidAlias?.toString() || legacyDpid?.toString();
  // Intentionally above stacked promise, needs the DPID to be resolved!!!
  // Send emails coupled to the publish event
  await PublishServices.handleDeferredEmails(node.uuid, dpid, publishStatusId);

  /*
   * Emit notification on publish
   */
  await emitNotificationOnPublish(node, owner, dpid, publishStatusId);

  const targetDpidUrl = getTargetDpidUrl();
  discordNotify({ message: `${targetDpidUrl}/${dpidAlias}` });

  /**
   * Save the cover art for this Node for later sharing: PDF -> JPG for this version
   */
  cacheNodeMetadata(node.uuid, cid);
  return dpidAlias;
};

/**
 * Creates new dPID if legacyDpid is falsy, otherwise tries to upgrade
 * the dPID by binding the stream in the alias registry for that dPID.
 */
export const createOrUpgradeDpidAlias = async (
  legacyDpid: number | undefined,
  ceramicStream: string,
  uuid: string,
  publishStatusId: number,
): Promise<number> => {
  const logger = parentLogger.child({
    module: 'NODE::createOrUpgradeDpidAlias',
    legacyDpid,
    ceramicStream,
    uuid,
    publishStatusId,
  });

  let dpidAlias: number;
  if (legacyDpid) {
    // Use subgraph lookup to ensure we don't get the owner from the stream and compare with itself
    const legacyHistory = await _getIndexedResearchObjects([uuid]);

    // On the initial legacy publish, the subgraph hasn't had time to index the event at this point.
    // If it returns successfully, but array is empty, we can assume this is the first publish.
    // and OK the check as there isn't any older history to contend with.
    // This likely only happens in the legacy publish tests in nodes-lib, as legacy publish is disabled in the app.
    const legacyOwner = legacyHistory.researchObjects[0]?.owner;

    const streamInfo = await directStreamLookup(ceramicStream);
    if ('err' in streamInfo) {
      logger.error(streamInfo, 'Failed to load stream when doing checks before upgrade');
      throw new Error('Failed to load stream');
    }
    const streamController = streamInfo.state.metadata.controllers[0].toLowerCase();
    const differentOwner = legacyOwner?.toLowerCase() !== streamController.split(':').pop().toLowerCase();

    // Caveat from above: if there was a legacyDpid, but no owner, we're likely in the middle of that process
    // and nodes-lib has published both with the same key regardless
    if (differentOwner && legacyOwner !== undefined) {
      logger.error({ streamController, legacyOwner }, 'Legacy owner and stream controller differs');
      throw new Error('Legacy owner and stream controller differs');
    }

    // Requires the REGISTRY_OWNER_PKEY to be set in env
    dpidAlias = await upgradeDpid(legacyDpid, ceramicStream);
  } else {
    // Will nicely return the existing dpid if this is called multiple times
    dpidAlias = await getOrCreateDpid(ceramicStream);
  }
  await setDpidAlias(uuid, dpidAlias);
  if (dpidAlias) {
    await PublishServices.updatePublishStatusEntry({
      publishStatusId,
      data: {
        assignDpid: true,
      },
    });
  } else {
    console.error({ fn: 'createOrUpgradeDpidAlias', dpidAlias, uuid, publishStatusId }, 'Failed DPID assignment');
    await PublishServices.updatePublishStatusEntry({
      publishStatusId,
      data: {
        assignDpid: false,
      },
    });
  }
  return dpidAlias;
};

type PublishData = {
  nodeId: number;
  nodeUuid: string;
  userId: number;
  manifestCid: string;
  nodeVersionId: number;
  publishStatusId: number;
};

export const handlePublicDataRefs = async (params: PublishData): Promise<void> => {
  const { nodeId, nodeUuid, userId, manifestCid, nodeVersionId } = params;

  const logger = parentLogger.child({
    module: 'NODE::handlePublicDataRefs',
    uuid: nodeUuid,
    cid: manifestCid,
  });

  /**
   * Publish Step 1:
   * Create public data refs and data mirror jobs from the CIDs in the manifest
   */
  let cidsRequiredForPublish: Prisma.PublicDataReferenceCreateManyInput[] = [];
  try {
    /***
     * Traverse the DAG structure to find all relevant CIDs and get relevant info for indexing
     */
    cidsRequiredForPublish = await getAllCidsRequiredForPublish(manifestCid, nodeUuid, userId, nodeId, nodeVersionId);

    /**
     * Index the DAGs from IPFS in order to avoid recurrent IPFS calls when requesting data in the future
     */
    const newPublicDataRefs = await createPublicDataRefs(cidsRequiredForPublish, userId, nodeVersionId);

    /**
     * Save a success for configurable service quality tracking purposes
     */
    await saveInteractionWithoutReq(ActionType.PUBLISH_NODE_CID_SUCCESS, {
      params,
      result: { newPublicDataRefs },
    });
    await PublishServices.updatePublishStatusEntry({
      publishStatusId: params.publishStatusId,
      data: {
        createPdr: true,
      },
    });
  } catch (error) {
    logger.error({ error }, `[publish::publish] error=${error}`);
    /**
     * Save a failure for configurable service quality tracking purposes
     */
    await saveInteractionWithoutReq(ActionType.PUBLISH_NODE_CID_FAIL, {
      params,
      error,
    });
    await PublishServices.updatePublishStatusEntry({
      publishStatusId: params.publishStatusId,
      data: {
        createPdr: false,
      },
    });
    throw error;
  }
};

export const publishHandler = async ({
  transactionId,
  userId,
  ceramicStream,
  commitId,
  cid,
  uuid,
}: {
  transactionId: string;
  cid: string;
  userId: number;
  uuid: string;
  ceramicStream: string;
  commitId: string;
}) => {
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::publishTask',
    uuid,
    cid,
    transactionId,
  });
  try {
    /**TODO: MOVE TO MIDDLEWARE */
    const owner = await prisma.user.findFirst({
      where: {
        id: userId,
      },
    });

    if (!owner.id || owner.id < 1) {
      throw Error('User ID mismatch');
    }

    const node = await prisma.node.findFirst({
      where: {
        ownerId: owner.id,
        uuid: ensureUuidEndsWithDot(uuid),
      },
    });

    if (!node) {
      logger.warn({ owner, uuid }, `unauthed node user: ${owner}, node uuid provided: ${uuid}`);
      // return res.status(400).json({ error: 'failed' });
      throw new Error('Node not found');
    }
    /**TODO: END MOVE TO MIDDLEWARE */

    /*
     ** Add PublishStatus entry
     */
    const publishStatusEntry = await PublishServices.createPublishStatusEntry(uuid);
    await PublishServices.updatePublishStatusEntry({
      publishStatusId: publishStatusEntry.id,
      data: {
        commitId: commitId,
        ceramicCommit: true,
      },
    });

    // update node version
    const latestNodeVersion = await prisma.nodeVersion.findFirst({
      where: {
        nodeId: node.id,
      },
      orderBy: {
        id: 'desc',
      },
    });

    // Prevent duplicating the NodeVersion entry if the latest version is the same as the one we're trying to publish, as a draft save is triggered before publishing
    const latestNodeVersionId = latestNodeVersion?.manifestUrl === cid ? latestNodeVersion.id : -1;

    const nodeVersion = await prisma.nodeVersion.upsert({
      where: {
        id: latestNodeVersionId,
      },
      update: {
        transactionId,
        commitId,
      },
      create: {
        nodeId: node.id,
        manifestUrl: cid,
        transactionId,
        commitId,
      },
    });

    // Prevent removing the stream info if subsequent publish request is missing it
    if (ceramicStream) {
      logger.trace(`[ceramic] setting streamID ${ceramicStream} on node ${uuid}`);
      await setCeramicStream(uuid, ceramicStream);
    } else {
      // Likely feature toggle is active in backend, but not in frontend
      logger.warn(`[ceramic] wanted to set streamID for ${node.uuid} but request did not contain one`);
    }

    logger.trace(`[publish::publish] nodeUuid=${node.uuid}, manifestCid=${cid}, transaction=${transactionId}`);

    await handlePublicDataRefs({
      nodeId: node.id,
      nodeUuid: node.uuid,
      userId: owner.id,
      manifestCid: cid,
      nodeVersionId: nodeVersion.id,
      publishStatusId: publishStatusEntry.id,
    });

    const manifest = await getManifestByCid(cid);
    const targetDpidUrl = getTargetDpidUrl();
    discordNotify({ message: `${targetDpidUrl}/${manifest.dpid?.id}` });

    const dpid = node.dpidAlias?.toString() ?? manifest.dpid?.id;

    /**
     * Fire off any deferred emails awaiting publish
     */
    await PublishServices.handleDeferredEmails(node.uuid, dpid, publishStatusEntry.id);

    /*
     * Emit notification on publish
     */
    await emitNotificationOnPublish(node, owner, dpid, publishStatusEntry.id);

    /**
     * Save the cover art for this Node for later sharing: PDF -> JPG for this version
     */
    cacheNodeMetadata(node.uuid, cid);

    return true;
  } catch (err) {
    logger.error({ err }, '[publish::publish] node-publish-err');
    return false;
  }
};
