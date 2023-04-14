import { Request, Response } from 'express';
import { cleanupManifestUrl } from 'utils';

const BANNER_URL =
  'https://images.unsplash.com/photo-1679669693237-74d556d6b5ba?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2298&q=80';

// TODO:
// verify CID is in dataRefs table
// pull cover images from db if cid has been generated
// generate new cover image from pdf if not found
// push to ipfs and get image Link
// store in database and return ipfs link
const cover = function (req: Request, res: Response) {
  const url = cleanupManifestUrl(req.params.cid, req.query?.g as string);
  console.log('request', req.query, req.params, url);
  try {
    res.status(200).send({ url: BANNER_URL });
  } catch (err) {
    console.log(err);
    res.status(500).send(JSON.stringify(err));
  }
};

export default cover;
