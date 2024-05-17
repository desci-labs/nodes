import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { ActionType, Prisma, PublishTaskQueueStatus, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { getManifestByCid } from '../../services/data/processing.js';
import { fixDpid, getTargetDpidUrl } from '../../services/fixDpid.js';
import { saveInteraction, saveInteractionWithoutReq } from '../../services/interactionLog.js';
import {
  publishResearchObject,
  cacheNodeMetadata,
  getAllCidsRequiredForPublish,
  createPublicDataRefs,
  createDataMirrorJobs,
  setCeramicStream,
} from '../../services/nodeManager.js';
import orcidApiService from '../../services/orcid.js';
import { publishServices } from '../../services/PublishServices.js';
import { discordNotify } from '../../utils/discordUtils.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

export type PublishReqBody = {
  uuid: string;
  cid: string;
  manifest: ResearchObjectV1;
  transactionId: string;
  ceramicStream?: string;
  commitId?: string;
};

export type PublishRequest = Request<never, never, PublishReqBody> & {
  user: User; // added by auth middleware
};

export type PublishResBody =
  | {
      ok: boolean;
      taskId: number;
    }
  | {
      error: string;
    };

// call node publish service and add job to queue
export const publish = async (req: PublishRequest, res: Response<PublishResBody>, _next: NextFunction) => {
  const { uuid, cid, manifest, transactionId, ceramicStream, commitId } = req.body;
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

    const task = await prisma.publishTaskQueue.findFirst({
      where: { uuid: ensureUuidEndsWithDot(uuid), status: { not: PublishTaskQueueStatus.FAILED } },
    });

    if (task) return res.status(400).json({ error: 'Node publishing in progress' });

    saveInteraction(
      req,
      ActionType.PUBLISH_NODE,
      {
        cid,
        dpid: manifest.dpid.id,
        userId: owner.id,
        transactionId,
        ceramicStream: ceramicStream ?? '',
        commitId: commitId ?? '',
        uuid: ensureUuidEndsWithDot(uuid),
        status: PublishTaskQueueStatus.WAITING,
      },
      owner.id,
    );

    const publishTask = await prisma.publishTaskQueue.create({
      data: {
        cid,
        dpid: manifest.dpid.id,
        userId: owner.id,
        transactionId,
        ceramicStream: ceramicStream ?? '',
        commitId: commitId ?? '',
        uuid: ensureUuidEndsWithDot(uuid),
        status: PublishTaskQueueStatus.WAITING,
      },
    });

    return res.send({
      ok: true,
      taskId: publishTask.id,
    });
  } catch (err) {
    logger.error({ err }, '[publish::publish] node-publish-err');
    return res.status(400).send({ ok: false, error: err.message });
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

    const cidsPayload = {
      nodeId: node.id,
      userId: owner.id,
      manifestCid: cid,
      nodeVersionId: nodeVersion.id,
      nodeUuid: node.uuid,
    };

    /**
     * Publish Step 1:
     * Create public data refs and data mirror jobs from the CIDs in the manifest
     */
    let cidsRequiredForPublish: Prisma.PublicDataReferenceCreateManyInput[] = [];
    // debugger;
    try {
      /***
       * Traverse the DAG structure to find all relevant CIDs and get relevant info for indexing
       */
      cidsRequiredForPublish = await getAllCidsRequiredForPublish(cid, node.uuid, owner.id, node.id, nodeVersion.id);

      /**
       * Index the DAGs from IPFS in order to avoid recurrent IPFS calls when requesting data in the future
       */
      const newPublicDataRefs = await createPublicDataRefs(cidsRequiredForPublish, owner.id, nodeVersion.id);

      /**
       * Create a job per mirror in order to track the status of the upload
       * There can be multiple mirrors per node, right now there is just Estuary
       *
       * NOTE: uncomment when reactivating public ref mirroring
       const dataMirrorJobs = await createDataMirrorJobs(cidsRequiredForPublish, owner.id);
       */

      // TODO: update public data refs to link versionId

      /**
       * Save a success for configurable service quality tracking purposes
       */
      await saveInteractionWithoutReq(ActionType.PUBLISH_NODE_CID_SUCCESS, {
        cidsPayload,
        result: { newPublicDataRefs },
      });
    } catch (error) {
      logger.error({ error }, `[publish::publish] error=${error}`);
      /**
       * Save a failure for configurable service quality tracking purposes
       */
      await saveInteractionWithoutReq(ActionType.PUBLISH_NODE_CID_FAIL, { cidsPayload, error });
      throw error;
    }

    /**
     * Publish Step 2:
     * Initiate IPFS storage upload using Estuary
     */
    const manifest = await getManifestByCid(cid);

    const targetDpidUrl = getTargetDpidUrl();

    // const researchObjectToPublish = { uuid, cid, manifest, ownerId: owner.id };
    const sendDiscordNotification = (error: boolean) => {
      const manifestSource = manifest as ResearchObjectV1;
      discordNotify(`${targetDpidUrl}/${manifestSource.dpid?.id}${error ? ' (note: estuary-err)' : ''}`);
    };

    // Send an email update to all contributors
    await publishServices.sendVersionUpdateEmailToAllContributors({ node });

    /**
     * NOTE: uncomment when reactivating public ref mirroring
    const handleMirrorSuccess = async (publishedResearchObjectResult) => {
      await saveInteractionWithoutReq(ActionType.PUBLISH_NODE_RESEARCH_OBJECT_SUCCESS, {
        researchObjectToPublish,
        result: publishedResearchObjectResult,
      });

      sendDiscordNotification(false);
    };
    const handleMirrorFail = async (error) => {
      await saveInteractionWithoutReq(ActionType.PUBLISH_NODE_RESEARCH_OBJECT_FAIL, {
        researchObjectToPublish,
        error,
      });

      sendDiscordNotification(true);
    };

    const publicDataReferences = await prisma.publicDataReference.findMany({
      where: {
        versionId: nodeVersion.id,
      },
    });
    logger.debug(
      { publicDataReferences },
      `[publish::publish] publicDataReferences=${JSON.stringify(publicDataReferences)}`,
    );

    // trigger ipfs storage upload, but don't wait for it to finish, will happen async
    publishResearchObject(publicDataReferences).then(handleMirrorSuccess).catch(handleMirrorFail);
    */
    sendDiscordNotification(false);

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
