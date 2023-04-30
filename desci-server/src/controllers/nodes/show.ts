import { ResearchObjectV1, ResearchObjectV1History, RESEARCH_OBJECT_NODES_PREFIX } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';
import { CID } from 'multiformats/cid';

import prisma from 'client';
import { PUBLIC_IPFS_PATH } from 'config';

export const cleanupManifestUrl = (url: string, gateway?: string) => {
  if (url && (PUBLIC_IPFS_PATH || gateway)) {
    const s = url.split('/');
    const res = `${gateway ? gateway : PUBLIC_IPFS_PATH}/${s[s.length - 1]}`;
    console.log(`resolving ${url} => ${res}`);
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
  debugger;
  let ownerId = (req as any).user?.id;
  const shareId = req.query.shareId as string;
  let cid: string = null;
  let pid = req.params[0];

  if (shareId) {
    const privateShare = await prisma.privateShare.findFirst({
      where: { shareId },
      select: { node: true, nodeUUID: true },
    });
    const node = privateShare.node;

    if (privateShare && node) {
      pid = `${RESEARCH_OBJECT_NODES_PREFIX}${privateShare.nodeUUID.substring(0, privateShare.nodeUUID.length - 1)}`;
      ownerId = node.ownerId;
    }
  } else if (!ownerId) {
    res.status(401).send({ ok: false, message: 'Unauthorized user' });
    return;
  }

  // console.log(pid, ownerId, RESEARCH_OBJECT_NODES_PREFIX);
  if (pid.substring(0, RESEARCH_OBJECT_NODES_PREFIX.length) === RESEARCH_OBJECT_NODES_PREFIX) {
    let id = 0;
    let uuid = null;
    try {
      if (pid.length > 15) {
        throw Error('uuid');
      }
      id = parseInt((pid.substring(RESEARCH_OBJECT_NODES_PREFIX.length) || '').toString());
    } catch (e) {
      // console.log('YERROR');
      // console.error(e);
      uuid = (pid.substring(RESEARCH_OBJECT_NODES_PREFIX.length) || '').toString();
    }
    const discovery = await prisma.node.findFirst({
      where: {
        id: uuid ? undefined : id,
        uuid: uuid + '.',
        ownerId,
      },
    });

    if (!discovery) {
      res.sendStatus(403);
      return;
    }

    let gatewayUrl = discovery.manifestUrl;
    try {
      gatewayUrl = cleanupManifestUrl(gatewayUrl, req.query?.g as string);
      (discovery as any).manifestData = transformManifestWithHistory((await axios.get(gatewayUrl)).data, discovery);

      delete (discovery as any).restBody;
    } catch (err) {
      console.error('nodes/show.ts: failed to preload manifest', discovery.manifestUrl, gatewayUrl, err);
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
    console.error(e);
    // res.status(404).send();
    // example
    const discovery = await prisma.node.findFirst();
    discovery.manifestUrl = `${process.env.SERVER_URL}/v1/ipfs/read/test`;
    res.send(discovery);
  }
};
