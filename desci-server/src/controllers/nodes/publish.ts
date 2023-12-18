import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { ActionType, Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import parentLogger from 'logger';
import { saveInteraction } from 'services/interactionLog';
import {
  publishResearchObject,
  cacheNodeMetadata,
  getAllCidsRequiredForPublish,
  createPublicDataRefs,
  createDataMirrorJobs,
} from 'services/nodeManager';
import { validateAndHealDataRefs } from 'utils/dataRefTools';
import { discordNotify } from 'utils/discordUtils';

// call node publish service and add job to queue
export const publish = async (req: Request, res: Response, next: NextFunction) => {
  const { uuid, cid, manifest, transactionId, nodeVersionId } = req.body;
  debugger;
  const email = (req as any).user.email;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::publishController',
    body: req.body,
    uuid,
    cid,
    manifest,
    transactionId,
    email,
    user: (req as any).user,
  });
  if (!uuid || !cid || !manifest) {
    return res.status(404).send({ message: 'uuid, cid, email, and manifest must be valid' });
  }

  if (email === undefined || email === null) {
    // Prevent any issues with prisma findFirst with undefined fields
    return res.status(401).send({ message: 'email must be valid' });
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
        uuid: uuid.endsWith('.') ? uuid : uuid + '.',
      },
    });

    if (!node) {
      logger.warn({ owner, uuid }, `unauthed node user: ${owner}, node uuid provided: ${uuid}`);
      return res.status(400).json({ error: 'failed' });
    }
    /**TODO: END MOVE TO MIDDLEWARE */

    // update node version
    const latestNodeVersion = await prisma.nodeVersion.findFirst({
      where: {
        id: nodeVersionId || -1,
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
      },
      create: {
        nodeId: node.id,
        manifestUrl: cid,
        transactionId,
      },
    });

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
       */
      const dataMirrorJobs = await createDataMirrorJobs(cidsRequiredForPublish, owner.id);

      // TODO: update public data refs to link versionId

      /**
       * Save a success for configurable service quality tracking purposes
       */
      await saveInteraction(req, ActionType.PUBLISH_NODE_CID_SUCCESS, {
        cidsPayload,
        result: { newPublicDataRefs, dataMirrorJobs },
      });
    } catch (error) {
      logger.error({ error }, `[publish::publish] error=${error}`);
      /**
       * Save a failure for configurable service quality tracking purposes
       */
      await saveInteraction(req, ActionType.PUBLISH_NODE_CID_FAIL, { cidsPayload, error });
      throw error;
    }

    /**
     * Publish Step 2:
     * Initiate IPFS storage upload using Estuary
     */

    const researchObjectToPublish = { uuid, cid, manifest, ownerId: owner.id };
    const sendDiscordNotification = (error) => {
      const manifestSource = manifest as ResearchObjectV1;
      discordNotify(
        `https://${manifestSource.dpid?.prefix}.dpid.org/${manifestSource.dpid?.id}${
          error ? ' (note: estuary-err)' : ''
        }`,
      );
    };

    const handleMirrorSuccess = async (publishedResearchObjectResult) => {
      await saveInteraction(req, ActionType.PUBLISH_NODE_RESEARCH_OBJECT_SUCCESS, {
        researchObjectToPublish,
        result: publishedResearchObjectResult,
      });

      sendDiscordNotification(false);
    };
    const handleMirrorFail = async (error) => {
      await saveInteraction(req, ActionType.PUBLISH_NODE_RESEARCH_OBJECT_FAIL, {
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
    // Disabled bandaid fix, shouldn't be necessary if publish step handled correctly on frontend.
    // .finally(async () => {
    //   await validateAndHealDataRefs({
    //     nodeUuid: node.uuid!,
    //     manifestCid: cid,
    //     publicRefs: true,
    //     markExternals: true,
    //   });
    // });

    /**
     * Save the cover art for this Node for later sharing: PDF -> JPG for this version
     */
    cacheNodeMetadata(node.uuid, cid);

    return res.send({
      ok: true,
    });
  } catch (err) {
    logger.error({ err }, '[publish::publish] node-publish-err');
    return res.status(400).send({ ok: false, error: err.message });
  }
};
