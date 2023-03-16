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
    const hasMetadata = body.links.pdf[0].indexOf('data:') < 0;
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
  const owner = (req as any).user;

  let cid: string = null;
  const pid = req.params[0];
  console.log('show research object', req.params);
  console.log(pid, RESEARCH_OBJECT_NODES_PREFIX);
  if (pid.substring(0, RESEARCH_OBJECT_NODES_PREFIX.length) === RESEARCH_OBJECT_NODES_PREFIX) {
    console.log('Loading Draft / Stub ResearchObject');
    let id = 0;
    let uuid = null;
    try {
      if (pid.length > 15) {
        throw Error('uuid');
      }
      id = parseInt((pid.substring(RESEARCH_OBJECT_NODES_PREFIX.length) || '').toString());
      console.log('GOT ID', id);
    } catch (e) {
      // console.log('YERROR');
      // console.error(e);
      uuid = (pid.substring(RESEARCH_OBJECT_NODES_PREFIX.length) || '').toString();
    }
    const discovery = await prisma.node.findFirst({
      where: {
        id: uuid ? undefined : id,
        uuid: uuid + '.',
        ownerId: owner.id,
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
      console.error('nodes/show.ts: failed to preload manifest', discovery.manifestUrl, gatewayUrl);
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
