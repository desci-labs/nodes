import Arweave from 'arweave/node';
import dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/../../.env' });

const config = {
  host: process.env.ARWEAVE_HOST,
  port: process.env.ARWEAVE_PORT,
  protocol: process.env.ARWEAVE_PROTOCOL,
};
console.log('ARWEAVE CONFIG', config);

const arweave = Arweave.init(config);

let k;
arweave.wallets.generate().then((key) => {
  k = key;
  arweave.wallets.jwkToAddress(k).then((address) => {
    console.log('PUBLIC ADDRESS', address);
    console.log('PRIVATE KEY', Buffer.from(JSON.stringify(k)).toString('base64'));
  });
});
