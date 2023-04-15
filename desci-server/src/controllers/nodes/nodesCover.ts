import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';

if (!process.env.NODES_MEDIA_SERVER_URL) {
  throw Error('NODES_MEDIA_SERVER_URL not found, add to env file');
}

const MEDIA_SERVER_API_URL = process.env.NODES_MEDIA_SERVER_URL;
const SECRET_KEY = process.env.MEDIA_SECRET_KEY;

export const getCoverImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // const owner = (req as any).user;
    const cid = req.params.cid as string;
    const nodeUUID = req.query.nodeUuid as string;
    console.log('params', cid, nodeUUID, req.params, req.query);
    // check cid exists in data refs table

    const url = `${MEDIA_SERVER_API_URL}/v1/nodes/cover/${cid}`;
    const data = await (await axios.post(url, {})).data;
    console.log('response from nodes media: ', data);
    res.send({ ok: true, url: '' });
  } catch (e) {
    console.log('error', e);
    res.status(404).send({ ok: false, message: 'Error generating cover image' });
  }
};
