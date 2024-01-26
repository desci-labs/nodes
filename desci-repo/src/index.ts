import { logger } from './logger.js';
import { server } from './server.js';
// import * as db from './dbs/index.js';

server.ready().then(async (_) => {
  logger.info('server is ready');
  // const nodes = await pool.query('SELECT * from nodes');
  // console.log('nodes', nodes);
});
