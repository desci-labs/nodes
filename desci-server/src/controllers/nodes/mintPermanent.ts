import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import Arweave from 'arweave';
import axios from 'axios';

let arweave, key;
if (process.env.ARWEAVE_ENABLED === '1') {
  const config = {
    host: process.env.ARWEAVE_HOST,
    port: process.env.ARWEAVE_PORT,
    protocol: process.env.ARWEAVE_PROTOCOL,
  };
  key = JSON.parse(Buffer.from(process.env.ARWAVE_SECRET_PRIVATE_KEY_SECRET, 'base64').toString());
  console.log('ARWEAVE CONFIG', config);

  arweave = Arweave.init(config);

  setTimeout(() => {
    arweave.wallets.getAddress(key).then((k) => {
      console.log('PUBLIC KEY', k);
      arweave.wallets.getBalance(k).then((bal) => {
        console.log('ARWEAVE BALANCE', bal);
      });
    });
  }, 100);
}

const readFileContentAndAddToPermaweb = async ({ title, links: { pdf } }): Promise<string> => {
  //   let data = fs.readFileSync();

  const response = await axios.get('http://www.africau.edu/images/default/sample.pdf', { responseType: 'blob' });
  const data = Buffer.from(response.data);
  console.log('DATA', data);

  let transaction = await arweave.createTransaction({ data: data }, key);
  transaction.addTag('Content-Type', 'application/pdf');

  await arweave.transactions.sign(transaction, key);

  let uploader = await arweave.transactions.getUploader(transaction);
  
  console.log('GOT UPLOADER', transaction.chunks);

  let count = 0;
  while (!uploader.isComplete) {
    console.log('UPLOADING CHUNK', count);
    await uploader.uploadChunk();
    console.log(`${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`);
    count += 1;
  }
  return transaction.id;
};

export const mintPermanent = async (req: Request, res: Response, next: NextFunction) => {
  const {
    title,
    links: { pdf },
  } = req.body;

  console.log('MINT', req.body);

  try {
    // save to ARWEAVE
    let hash;
    if (process.env.ARWEAVE_ENABLED === '1') {
      hash = await readFileContentAndAddToPermaweb({ title, links: { pdf } });
    }

    // TODO: save to StarkNet Contract

    res.send({
      ok: true,
      hash,
    });
  } catch (err) {
    console.error(err);
    console.error('mint-err', err);
    res.status(400).send({ ok: false, error: err });
  }
};
