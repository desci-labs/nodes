import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { ActionType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import { saveInteraction } from 'services/interactionLog';
import { publishCIDS, publishResearchObject, cacheNodeMetadata } from 'services/nodeManager';
import { discordNotify } from 'utils/discordUtils';

// call node publish service and add job to queue
export const publish = async (req: Request, res: Response, next: NextFunction) => {
  const { uuid, cid, manifest, transactionId } = req.body;
  const email = (req as any).user.email;
  if (!uuid || !cid || !manifest) {
    return res.status(404).send({ message: 'uuid, cid, and manifest must be valid' });
  }

  try {
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
        uuid: uuid + '.',
      },
    });
    if (!node) {
      console.log(`unauthed node user: ${owner}, node uuid provided: ${uuid}`);
      return res.status(400).json({ error: 'failed' });
    }

    // update node version
    const nodeVersion = await prisma.nodeVersion.create({
      data: {
        nodeId: node.id,
        manifestUrl: cid,
        transactionId,
      },
    });

    const cidsPayload = { nodeId: node.id, userId: owner.id, manifestCid: cid, nodeVersionId: nodeVersion.id };
    const researchObjectToPublish = { uuid, cid, manifest, ownerId: owner.id };

    try {
      const publishedCidsResult = await publishCIDS(cidsPayload);
      await saveInteraction(req, ActionType.PUBLISH_NODE_CID_SUCCESS, { cidsPayload, result: publishedCidsResult });
    } catch (error) {
      await saveInteraction(req, ActionType.PUBLISH_NODE_CID_FAIL, { cidsPayload, error });
      throw error;
    }

    // trigger ipfs storage upload
    publishResearchObject(researchObjectToPublish)
      .then(async (publishedResearchObjectResult) => {
        await saveInteraction(req, ActionType.PUBLISH_NODE_RESEARCH_OBJECT_SUCCESS, {
          researchObjectToPublish,
          result: publishedResearchObjectResult,
        });

        const manifestSource = manifest as ResearchObjectV1;
        discordNotify(`https://${manifestSource.dpid.prefix}.dpid.org/${manifestSource.dpid.id}`);
      })
      .catch(async (error) => {
        await saveInteraction(req, ActionType.PUBLISH_NODE_RESEARCH_OBJECT_FAIL, {
          researchObjectToPublish,
          error,
        });

        const manifestSource = manifest as ResearchObjectV1;
        discordNotify(`https://${manifestSource.dpid.prefix}.dpid.org/${manifestSource.dpid.id} (note: estuary-err)`);
      });

    cacheNodeMetadata(node.uuid, cid);

    return res.send({
      ok: true,
    });
  } catch (err) {
    console.error('node-publish-err', err);
    return res.status(400).send({ ok: false, error: err.message });
  }
};
