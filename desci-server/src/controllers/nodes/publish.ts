import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { ActionType, Node, Prisma, PublishTaskQueue, PublishTaskQueueStatus, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { getManifestByCid } from '../../services/data/processing.js';
import { getTargetDpidUrl } from '../../services/fixDpid.js';
import { saveInteraction, saveInteractionWithoutReq } from '../../services/interactionLog.js';
import {
  cacheNodeMetadata,
  getAllCidsRequiredForPublish,
  createPublicDataRefs,
  setCeramicStream,
  setDpidAlias,
} from '../../services/nodeManager.js';
import { discordNotify } from '../../utils/discordUtils.js';
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
};

export type PublishRequest = Request<never, never, PublishReqBody> & {
  user: User; // added by auth middleware
};

export type PublishResBody =
  | {
      ok: boolean;
      taskId?: number;
    }
  | {
      error: string;
    };

// call node publish service and add job to queue
export const publish = async (
  req: PublishRequest,
  res: Response<PublishResBody>,
  _next: NextFunction
) => {
  const { uuid, cid, manifest, transactionId, ceramicStream, commitId, useNewPublish } = req.body;
  // debugger;
  const email = req.user.email;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::publishController',
    body: req.body,
    uuid,
    cid,
    manifest,
    transactionId,
    ceramicStream,
    commitId,
    email,
    user: req.user,
    useNewPublish,
  });

  if (!uuid || !cid || !manifest) {
    return res.status(404).send({ error: 'uuid, cid, email, and manifest must be valid' });
  }

  if (email === undefined || email === null) {
    // Prevent any issues with prisma findFirst with undefined fields
    return res.status(401).send({ error: 'email must be valid' });
  }

  if (!(ceramicStream && commitId)) {
    logger.warn({ uuid }, `[publish] called with unexpected stream (${ceramicStream}) and/org commit (${commitId})`);
  }

  try {
    /**TODO: MOVE TO MIDDLEWARE */
    const owner = await prisma.user.findFirst({
      where: {
        email,
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
      return res.status(400).json({ error: 'failed' });
    }

    // Check if there is already an ongoing publish job in the queue
    const task = await prisma.publishTaskQueue.findFirst({
      where: { uuid: ensureUuidEndsWithDot(uuid), status: { not: PublishTaskQueueStatus.FAILED } },
    });

    if (task) return res.status(400).json({ error: 'Node publishing in progress' });

    let publishTask: PublishTaskQueue | undefined;

    if (useNewPublish) {
      await syncPublish(
        ceramicStream,
        commitId,
        node,
        owner,
        cid,
        uuid,
        manifest,
      );
    } else {
      publishTask = await prisma.publishTaskQueue.create({
        data: {
          cid,
          dpid: manifest.dpid?.id,
          userId: owner.id,
          transactionId,
          ceramicStream,
          commitId,
          uuid: ensureUuidEndsWithDot(uuid),
          status: PublishTaskQueueStatus.WAITING,
        },
      });
    };

    saveInteraction(
      req,
      ActionType.PUBLISH_NODE,
      {
        cid,
        dpid: manifest.dpid?.id,
        userId: owner.id,
        transactionId,
        ceramicStream,
        commitId,
        uuid: ensureUuidEndsWithDot(uuid),
        status: PublishTaskQueueStatus.WAITING,
      },
      owner.id,
    );

    return res.send({
      ok: true,
      taskId: publishTask?.id,
    });
  } catch (err) {
    logger.error({ err }, '[publish::publish] node-publish-err');
    return res.status(400).send({ ok: false, error: err.message });
  };
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
*/
const syncPublish = async (
  ceramicStream: string,
  commitId: string,
  node: Node,
  owner: User,
  cid: string,
  uuid: string,
  manifest: ResearchObjectV1,
): Promise<void> => {
  const logger = parentLogger.child({
    module: 'NODE::syncPublish',
    uuid,
    cid,
    ceramicStream,
    commitId,
  });

  const latestNodeVersion = await prisma.nodeVersion.findFirst({
    where: {
      id: -1,
      nodeId: node.id,
    },
    orderBy: {
      id: "desc",
    },
  });

  // Prevent duplicating the NodeVersion entry if the latest version is the same as the one we're trying to publish, as a draft save is triggered before publishing
  const latestNodeVersionId = latestNodeVersion?.manifestUrl === cid
    ? latestNodeVersion.id
    : -1;

  const nodeVersion = await prisma.nodeVersion.upsert({
    where: {
      id: latestNodeVersionId,
    },
    update: {
      commitId,
    },
    create: {
      nodeId: node.id,
      manifestUrl: cid,
      commitId,
    },
  });

  // first time we see a stream for this node, make sure we bind it in the db
  if (!node.ceramicStream) {
    logger.trace(`[publish:publish] setting streamID ${ceramicStream} on node ${uuid}`);
    await setCeramicStream(uuid, ceramicStream);
  } else if (node.ceramicStream !== ceramicStream) {
    logger.warn(
      // This is unexpected and weird, but important to know if it occurs
      `[publish:publish] stream on record does not match passed streamID`,
      { database: node.ceramicStream, ceramicStream },
    );
  };

  const legacyDpid = manifest.dpid?.id ? parseInt(manifest.dpid.id) : undefined;
  let dpidAlias: number = node.dpidAlias;

  // Do dataRef and dPID registration operations concurrently
  const promises = [];

  if (!dpidAlias) {
    // The only reason this isn't just fire-and-forget is that we want the dpid
    // for the discord notification, which won't be available otherwise for
    // first time publishes.
    promises.push(
      createOrUpgradeDpidAlias(legacyDpid, ceramicStream, uuid)
      .then(dpid => dpidAlias = dpid)
    );
  };

  promises.push(
    handlePublicDataRefs({
      nodeId: node.id,
      userId: owner.id,
      manifestCid: cid,
      nodeVersionId: nodeVersion.id,
      nodeUuid: node.uuid,
    })
  );

  await Promise.all(promises);

  // TODO: different resolver url for codex? :thinking:
  const targetDpidUrl = getTargetDpidUrl();

  discordNotify(`${targetDpidUrl}/${dpidAlias}`);

  /**
   * Save the cover art for this Node for later sharing: PDF -> JPG for this version
   */
  cacheNodeMetadata(node.uuid, cid);
};

/**
 * Creates new dPID if legacyDpid is falsy, otherwise tries to upgrade
 * the dPID by binding the stream in the alias registry for that dPID.
*/
const createOrUpgradeDpidAlias = async (
  legacyDpid: number | undefined,
  ceramicStream: string,
  uuid: string,
): Promise<number> => {
  let dpidAlias: number;
  if (legacyDpid) {
    // Requires the REGISTRY_OWNER_PKEY to be set in env
    dpidAlias = await upgradeDpid(legacyDpid, ceramicStream);
  } else {
    // Will nicely return the existing dpid if this is called multiple times
    dpidAlias = await getOrCreateDpid(ceramicStream);
  };
  await setDpidAlias(uuid, dpidAlias);
  return dpidAlias;
};

type PublishData = {
  nodeId: number,
  nodeUuid: string,
  userId: number,
  manifestCid: string,
  nodeVersionId: number,
};

const handlePublicDataRefs = async (
  params: PublishData,
): Promise<void> => {
  const {
    nodeId,
    nodeUuid,
    userId,
    manifestCid,
    nodeVersionId,
  } = params;

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
    cidsRequiredForPublish = await getAllCidsRequiredForPublish(
      manifestCid,
      nodeUuid,
      userId,
      nodeId,
      nodeVersionId
    );

    /**
     * Index the DAGs from IPFS in order to avoid recurrent IPFS calls when requesting data in the future
     */
    const newPublicDataRefs = await createPublicDataRefs(
      cidsRequiredForPublish,
      userId,
      nodeVersionId,
    );

    /**
     * Save a success for configurable service quality tracking purposes
     */
    await saveInteractionWithoutReq(
      ActionType.PUBLISH_NODE_CID_SUCCESS,
      {
        params,
        result: { newPublicDataRefs },
      }
    );
  } catch (error) {
    logger.error({ error }, `[publish::publish] error=${error}`);
    /**
     * Save a failure for configurable service quality tracking purposes
     */
    await saveInteractionWithoutReq(
      ActionType.PUBLISH_NODE_CID_FAIL,
      {
        params,
        error
      }
    );
    throw error;
  };
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

    // update node version
    const latestNodeVersion = await prisma.nodeVersion.findFirst({
      where: {
        id: -1,
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
    });

    const manifest = await getManifestByCid(cid);
    const targetDpidUrl = getTargetDpidUrl();
    discordNotify(`${targetDpidUrl}/${manifest.dpid?.id}`);

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
