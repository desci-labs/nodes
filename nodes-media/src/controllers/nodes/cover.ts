import { Request, Response } from 'express';
import { cleanupManifestUrl } from 'utils';
import { fromPath } from 'pdf2pic';
import axios from 'axios';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import * as stream from 'stream';
import path from 'path';

const finished = promisify(stream.finished);

const BANNER_URL =
  'https://images.unsplash.com/photo-1679669693237-74d556d6b5ba?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2298&q=80';

const TMP_DIR = path.join(process.cwd(), '/tmp/');
const TMP_FILE = path.join(TMP_DIR, 'cover.pdf');

if (!existsSync(TMP_DIR)) {
  mkdirSync(TMP_DIR);
}
console.log(TMP_FILE);
// temp cache
const cache = {};
// TODO:
// verify CID is in dataRefs table
// pull cover images from db if cid has been generated
// generate new cover image from pdf if not found
// push to ipfs and get image Link
// store in database and return ipfs link
const options = {
  density: 100,
  saveFilename: 'cover',
  savePath: TMP_DIR,
  format: 'png',
  width: 600,
  height: 600,
};

const cover = async function (req: Request, res: Response) {
  const url = cleanupManifestUrl(req.params.cid, req.query?.g as string);

  const downloaded = await downloadFile(url, TMP_FILE);
  console.log('pdf data', downloaded);
  console.log('request', req.query, req.params, url);

  if (downloaded === false) {
    res.status(400).send({ ok: false, message: 'Cover not found' });
    return;
  }
  const nodeId = req.query?.nodeUUID as string;

  if (nodeId && cache[nodeId]) {
    res.status(200).send({ url: cache[nodeId] });
    return;
  }

  const storeAsImage = fromPath(TMP_FILE, options);
  const pageToConvertAsImage = 1;

  const cover = await storeAsImage(pageToConvertAsImage);
  console.log('Page 1 is now converted as image', cover);

  try {
    res.status(200).send({ url: BANNER_URL });
  } catch (err) {
    console.log(err);
    res.status(500).send(JSON.stringify(err));
  }
};

export const downloadFile = async (url: string, outputFileLocation: string): Promise<any> => {
  const writer = createWriteStream(outputFileLocation);

  return await axios({
    method: 'get',
    url: url,
    responseType: 'stream',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36',
    },
  })
    .then((response) => {
      response.data.pipe(writer);
      return finished(writer);
    })
    .catch((err) => false);
};

export default cover;
