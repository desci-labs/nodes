import { ResearchObjectV1, RESEARCH_OBJECT_NODES_PREFIX } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';
import { Response, NextFunction } from 'express';
import { CID } from 'multiformats/cid';

import { prisma } from '../../client.js';
import { PUBLIC_IPFS_PATH } from '../../config/index.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { attestationService } from '../../services/Attestation.js';
import { showNodeDraftManifest } from '../../services/nodeManager.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

const transformManifestWithHistory = (data: ResearchObjectV1, researchNode: Node) => {
  const ro = Object.assign({}, data);
  if (!ro.history || !ro.history.length) {
    const body = JSON.parse(researchNode.restBody as string);
    const hasMetadata = body.links.pdf[0]?.indexOf('data:') < 0;
    const rest = Object.assign({}, body);

    if (!hasMetadata) {
      rest.links.pdf = null;
      delete rest.links.pdf;
    }
  }
  return ro;
};

// Return ResearchObject manifest via CID or ResearchObject database ID
export const show = async (req: RequestWithNode, res: Response, next: NextFunction) => {
  let ownerId = req.user?.id;
  const shareId = req.query.shareId as string;
  let cid: string = null;
  let pid = req.params[0];
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::showController',
    body: req.body,
    cid,
    pid,
    shareId,
    user: { id: (req as any).user?.id, email: (req as any).user?.email },
  });
  logger.trace({}, 'show node');

  if (shareId) {
    logger.trace({ shareId }, 'got shareId');
    const privateShare = await prisma.privateShare.findFirst({
      where: { shareId },
      select: { node: true, nodeUUID: true },
    });
    const node = privateShare.node;
    logger.trace({ uuid: node.uuid, privateShare, shareId }, 'got node');

    if (privateShare && node) {
      pid = `${RESEARCH_OBJECT_NODES_PREFIX}${privateShare.nodeUUID.substring(0, privateShare.nodeUUID.length - 1)}`;
      ownerId = node.ownerId;
      logger.trace({ shareId, pid, ownerId });
    }
  } else if (!ownerId) {
    logger.warn({}, 'Unauthorized user');
    res.status(401).send({ ok: false, message: 'Unauthorized user' });
    return;
  }

  if (pid.substring(0, RESEARCH_OBJECT_NODES_PREFIX.length) === RESEARCH_OBJECT_NODES_PREFIX) {
    const uuid = (pid.substring(RESEARCH_OBJECT_NODES_PREFIX.length) || '').toString();
    logger.trace({ uuid }, 'got uuid');

    const discovery = await prisma.node.findFirst({
      where: {
        uuid: ensureUuidEndsWithDot(uuid),
        ownerId,
        isDeleted: false,
      },
    });

    if (!discovery) {
      logger.warn({ uuid }, 'uuid not found');
      res.sendStatus(403);
      return;
    }

    try {
      logger.trace('[showNodeDraftManifest]::START');
      (discovery as any).manifestData = await showNodeDraftManifest(discovery, req.query?.g as string);
      logger.trace('[showNodeDraftManifest]::END');
    } catch (err) {
      logger.error({ err }, 'nodes/show.ts: failed to preload manifest');
    }

    res.send({ ...discovery });
    return;
  }

  try {
    cid = CID.parse(pid).toString();
    const url = `${PUBLIC_IPFS_PATH}/${cid}`;
    const { data } = await axios.get(url);
    res.send(data);
    return;
  } catch (error) {
    logger.error({ error }, 'error');
    res.status(404).send();
  }
};
