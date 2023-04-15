import { Request, Response } from 'express';
import { cleanupManifestUrl } from 'utils';
import { fromPath } from 'pdf2pic';
import axios from 'axios';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from 'fs';
import { promisify } from 'util';
import * as stream from 'stream';
import path from 'path';
import * as ipfs from 'ipfs-http-client';
import { PUBLIC_IPFS_PATH } from 'config';

const SECRET_KEY = process.env.MEDIA_SECRET_KEY;
const client = ipfs.create({ url: process.env.IPFS_NODE_URL });

const finished = promisify(stream.finished);

const TMP_DIR = path.join(process.cwd(), '/tmp');
const TMP_FILE = path.join(TMP_DIR, 'cover.pdf');
const TMP_IMG = path.join(TMP_DIR, 'cover.1.png');

if (!existsSync(TMP_DIR)) {
  mkdirSync(TMP_DIR);
}

const options = {
  density: 100,
  saveFilename: 'cover',
  savePath: TMP_DIR,
  format: 'png',
  width: 600,
  height: 600,
};

const cover = async function (req: Request, res: Response) {
  try {
    const url = cleanupManifestUrl(req.params.cid, req.query?.g as string);

    const downloaded = await downloadFile(url, TMP_FILE);

    if (downloaded === false) {
      res.status(400).send({ ok: false, message: 'Cover not found' });
      return;
    }

    if (existsSync(TMP_IMG)) {
      // rmSync(TMP_IMG);
    }

    const storeAsImage = fromPath(TMP_FILE, options);

    const cover = await storeAsImage(1);
    console.log('Page 1 is now converted as image', cover);

    const buffer = readFileSync(TMP_IMG);
    const storedCover = await client.add(buffer, { cidVersion: 1 });

    // unlinkSync(TMP_IMG);

    console.log('storedCover', storedCover);

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
