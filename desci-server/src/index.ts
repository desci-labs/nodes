import { logger as parentLogger } from './logger.js';
import { redisClient, lockService } from './redisClient.js';
import { server } from './server.js';
import { SubmissionQueueJob } from './workers/doiSubmissionQueue.js';

const logger = parentLogger.child({
  module: 'index.ts',
});

server.ready().then((_) => {
  console.log('server is ready');
});
export const app = server.app;

/**
 * ALL process lifecycle hooks goes below, because:
 * 1. it prevents import cycles
 * 2. it makes sure we don't overwrite a hook already defined in another module
 */
process.on('exit', () => {
  logger.info('Process caught exit');
  lockService.freeLocks();
  redisClient.quit();
  SubmissionQueueJob.stop();
});

// catches ctrl+c event
process.on('SIGINT', () => {
  logger.info('Process caught SIGINT');
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('Process caught SIGTERM');
  process.exit(1);
});

// default kill signal for nodemon
process.on('SIGUSR2', () => {
  logger.info('Process caught SIGUSR2');
  process.exit(1);
});

// These should probably exit the process as it is not safe to continue
// execution after a generic exception has occurred:
// https://nodejs.org/api/process.html#warning-using-uncaughtexception-correctly
process.on('uncaughtException', (err) => {
  logger.fatal(err, 'uncaught exception');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'unhandled rejection');
});
