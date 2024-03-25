import type { Request, Response } from 'express';
// import { fromPath } from 'pdf2pic';
import axios from 'axios';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import * as stream from 'stream';
import path from 'path';
import { create } from 'kubo-rpc-client';
import { readFile } from 'fs/promises';
import * as im from 'imagemagick';
import { cleanupManifestUrl } from '../../utils.js';
import { PUBLIC_IPFS_PATH } from '../../config/index.js';

const client = create({ url: process.env.IPFS_NODE_URL });

const finished = promisify(stream.finished);
const convertAsync = promisify(im.convert);

const TMP_DIR = path.join(process.cwd(), '/tmp');
const TMP_FILE = path.join(TMP_DIR, 'cover.pdf');
const TARGET_IMG = path.join(TMP_DIR, 'cover.jpeg');

if (!existsSync(TMP_DIR)) {
  mkdirSync(TMP_DIR);
}

console.log('TMPDIR', TMP_DIR);

const cover = async function (req: Request, res: Response) {
  console.log('REQ', req.params, req.query);
  try {
    const url = cleanupManifestUrl(req.params.cid, req.query?.g as string);
    console.log('URL', url);

    const downloaded = await downloadFile(url, TMP_FILE);

    if (downloaded === false) {
      console.log('cover not found', url);
      res.status(400).send({ ok: false, message: 'Cover not found' });
      return;
    }

    console.log('starting convert', url);
    await convertAsync([`${TMP_FILE}[0]`, '-quality', '100', TARGET_IMG]);
    console.log('done convert', url);
    const buffer = await readFile(TARGET_IMG);
    const storedCover = await client.add(buffer, { cidVersion: 1 });

    res.status(200).send({ ok: true, url: `${PUBLIC_IPFS_PATH}/${storedCover.cid}` });
  } catch (err) {
    console.log(err);
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
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
