import path from 'path';

import dotenv from 'dotenv';
import 'dotenv/config';

dotenv.config({ path: path.join(process.cwd(), '../.env') });
console.log('[env]', path.join(process.cwd(), '../.env'), process.env.REDIS_HOST, process.env.REDIS_PORT);

import { prisma } from '../client.js';
import { redisClient } from '../redisClient.js';
import { EXTERNAL_PUB_REDIS_KEY } from '../services/crossRef/externalPublication.js';

const main = async () => {
  const rows = await prisma.externalPublications.deleteMany({});

  await redisClient.connect();
  // clear redis cache
  await deleteKeys(EXTERNAL_PUB_REDIS_KEY);
  return rows;
};

async function deleteKeys(pattern: string) {
  let cursor = 0;

  do {
    // Scan the Redis keyspace
    const res = await redisClient.scan(cursor, { MATCH: pattern as string, COUNT: 500 });
    cursor = res.cursor || 0;
    const keys = res.keys || [];

    // Delete the keys
    if (keys?.length > 0) {
      console.info({ keys }, `Found ${keys.length} keys, deleting...`);
      await Promise.all(keys.map(async (key) => await redisClient.del(key)));
    }
  } while (cursor !== 0);

  console.info({ pattern }, `All matching keys deleted.`);
  return;
}

main()
  .then((result) => {
    console.log('ExternalPublications Pruned', result);
    process.exit(0);
  })
  .catch((err) => console.log('Error running script ', err));
