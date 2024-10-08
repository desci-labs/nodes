import { logger } from './logger.js';
import { server } from './server.js';

server.ready().then(async (_) => {
  logger.info('server is ready');
  // const nodes = await pool.query('SELECT * from nodes');
  // console.log('nodes', nodes);
});
