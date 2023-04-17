import { User } from '@prisma/client';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';

if (!process.env.NODES_MEDIA_SERVER_URL) {
  throw Error('NODES_MEDIA_SERVER_URL not found, add to env file');
}

const MEDIA_SERVER_API_URL = process.env.NODES_MEDIA_SERVER_URL;
const MEDIA_SERVER_API_KEY = process.env.MEDIA_SECRET_KEY;

export const getCoverImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const owner = (req as any).user as User;
    const cid = req.params.cid as string;
    const nodeUUID = req.query.nodeUuid as string;

    if (!cid || !nodeUUID) throw Error('Invalid CID params or NodeUuid query');
    // check cid exists in data refs table

    const node = await prisma.node.findFirst({ where: { uuid: nodeUUID + '.' } });

    if (!node) throw Error('Node not found');

    const exists = await prisma.nodeCover.findFirst({ where: { nodeUUID: nodeUUID + '.' } });
    if (exists) {
      res.send({ ok: true, url: exists.url });
      return;
    }

    const dataRefExists = await prisma.dataReference.findFirst({ where: { cid, node: { uuid: nodeUUID + '.' } } });
    if (!dataRefExists) throw Error('Unknown CID reference');

    const data = await (
      await axios.post(
        `${MEDIA_SERVER_API_URL}/v1/nodes/cover/${cid}`,
        {},
        {
          headers: { 'x-api-key': MEDIA_SERVER_API_KEY },
        },
      )
    ).data;

    await prisma.nodeCover.upsert({
      where: { nodeUUID: nodeUUID + '.' },
      update: { url: data.url },
      create: { url: data.url, nodeUUID: nodeUUID + '.' },
    });

    res.send({ ok: true, url: data.url });
  } catch (e) {
    console.log('error', e);
    res.status(404).send({ ok: false, message: e.message || 'Error generating cover image' });
  }
};
