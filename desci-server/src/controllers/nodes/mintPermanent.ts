import Arweave from 'arweave';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import { logger as parentLogger } from '../../logger.js';

const logger = parentLogger.child({
  // id: req.id,
  module: 'NODE::mintPermanentHelpers',
});

let arweave, key;
if (process.env.ARWEAVE_ENABLED === '1') {
  const config = {
    host: process.env.ARWEAVE_HOST,
    port: process.env.ARWEAVE_PORT,
    protocol: process.env.ARWEAVE_PROTOCOL,
  };
  key = JSON.parse(Buffer.from(process.env.ARWAVE_SECRET_PRIVATE_KEY_SECRET, 'base64').toString());
  logger.debug({ config }, 'ARWEAVE CONFIG');

  arweave = Arweave.init(config);

  setTimeout(() => {
    arweave.wallets.getAddress(key).then((k) => {
      logger.debug({ pubKey: k }, 'PUBLIC KEY');
      arweave.wallets.getBalance(k).then((bal) => {
        logger.debug({ bal }, 'ARWEAVE BALANCE');
      });
    });
  }, 100);
}

const readFileContentAndAddToPermaweb = async ({ title, links: { pdf } }): Promise<string> => {
  //   let data = fs.readFileSync();

  const response = await axios.get('http://www.africau.edu/images/default/sample.pdf', { responseType: 'blob' });
  const data = Buffer.from(response.data);
  logger.trace({ fn: 'readFileContentAndAddToPermaweb', data }, 'DATA');

  const transaction = await arweave.createTransaction({ data: data }, key);
  transaction.addTag('Content-Type', 'application/pdf');

  await arweave.transactions.sign(transaction, key);

  const uploader = await arweave.transactions.getUploader(transaction);

  logger.info({ fn: 'readFileContentAndAddToPermaweb', txChunks: transaction.chunks }, 'GOT UPLOADER');

  let count = 0;
  while (!uploader.isComplete) {
    logger.info({ fn: 'readFileContentAndAddToPermaweb' }, `UPLOADING CHUNK ${count}`);
    await uploader.uploadChunk();
    logger.info(
      { fn: 'readFileContentAndAddToPermaweb' },
      `${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`,
    );
    count += 1;
  }
  return transaction.id;
};

export const mintPermanent = async (req: Request, res: Response, next: NextFunction) => {
  const {
    title,
    links: { pdf },
  } = req.body;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::mintPermanentController',
    body: req.body,
    title,
    pdf,
    user: (req as any).user,
  });

  logger.trace('MINT');

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
    logger.error({ err }, 'mint-err');
    res.status(400).send({ ok: false, error: err });
  }
};
