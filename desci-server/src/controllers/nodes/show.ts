import { ResearchObjectV1, ResearchObjectV1History, RESEARCH_OBJECT_NODES_PREFIX } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';
import { CID } from 'multiformats/cid';

import prisma from 'client';
import { PUBLIC_IPFS_PATH } from 'config';
import parentLogger from 'logger';

export const cleanupManifestUrl = (url: string, gateway?: string) => {
  if (url && (PUBLIC_IPFS_PATH || gateway)) {
    const s = url.split('/');
    const res = `${gateway ? gateway : PUBLIC_IPFS_PATH}/${s[s.length - 1]}`;
    parentLogger.info({ fn: 'cleanupManifestUrl', url, gateway }, `resolving ${url} => ${res}`);
    return res;
  }
  return url;
};

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
    // const historyEntry: ResearchObjectV1History = {
    //   title: 'Created Node',
    //   content: hasMetadata
    //     ? `Retrieved from ${body.links.pdf}`
    //     : `Uploaded file\n\n_${PUBLIC_IPFS_PATH}/${data.components[0].id}_`,
    //   date: researchNode.createdAt.getTime(),
    //   author: {
    //     id: '',
    //     name: '',
    //   },
    // };
    // ro.history = [historyEntry];
  }
  return ro;
};

// Return ResearchObject manifest via CID or ResearchObject database ID
export const show = async (req: Request, res: Response, next: NextFunction) => {
  let ownerId = (req as any).user?.id;
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
    user: (req as any).user,
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
        uuid: uuid + '.',
        ownerId,
        isDeleted: false,
      },
    });

    if (!discovery) {
      logger.warn({ uuid }, 'uuid not found');
      res.sendStatus(403);
      return;
    }

    let gatewayUrl = discovery.manifestUrl;
    try {
      gatewayUrl = cleanupManifestUrl(gatewayUrl, req.query?.g as string);
      logger.trace({ gatewayUrl, uuid }, 'transforming manifest');
      (discovery as any).manifestData = transformManifestWithHistory((await axios.get(gatewayUrl)).data, discovery);

      delete (discovery as any).restBody;

      logger.trace({ gatewayUrl, uuid }, 'transformed manifest');
    } catch (err) {
      logger.error(
        { err, manifestUrl: discovery.manifestUrl, gatewayUrl },
        'nodes/show.ts: failed to preload manifest',
      );
    }

    res.send(discovery);
    return;
  }

  try {
    cid = CID.parse(pid).toString();
    const url = `${PUBLIC_IPFS_PATH}/${cid}`;
    const { data } = await axios.get(url);
    res.send(data);
    return;
  } catch (e) {
    logger.error({ error: e }, 'error');
    // res.status(404).send();
    // example
    const discovery = await prisma.node.findFirst();
    discovery.manifestUrl = `${process.env.SERVER_URL}/v1/ipfs/read/test`;
    res.send(discovery);
  }
};
