import { errWithCause } from 'pino-std-serializers';

import { prisma } from './client.js';
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

/** Tracks ongoing graceful exit progress */
let isShuttingDown = false;

/** Async cleanup tasks we try to do before exiting  */
const cleanup = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  try {
    logger.info('Starting cleanup');

    await Promise.allSettled([
      // Stop accepting new requests
      new Promise((resolve, reject) => {
        server.server.close((err) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      }),
      lockService.freeLocks(),
      redisClient.quit(),
      SubmissionQueueJob.stop(),
      prisma.$disconnect(),
    ]);
  } catch (err) {
    logger.error({ err }, 'Cleanup failed');
  }
};

/** Async shutdown to use as signal hooks.
 * Notably, this will not work for
 * - `exit` (ignores async tasks)
 * - `SIGKILL` (the kernel will kill us basically immediately, can't be caught)
 */
const gracefulShutdown = async (signal: string) => {
  try {
    logger.info(`Process caught ${signal}, starting graceful shutdown`);
    await Promise.race([
      cleanup(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Cleanup timed out')), 5000)),
    ]);
  } catch (err) {
    logger.error({ err }, 'Graceful shutdown failed, exiting anyway');
  } finally {
    process.exit(1);
  }
};

// catches ctrl+c event
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
// default kill signal for nodemon
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'));

/** Enough to make sure logs are writted to stdout even when choking under load,
 * but if this has passed, ghetto-log and allow the proces to die.
 */
const FATAL_TIMEOUT_MS = 500;

/** Handler to use for uncaught exceptions and promise rejections, from which we
 * want to extract as much log info as possible to the log aggregator.
 */
const handleFatalError = async (error: unknown, type: string) => {
  // Mostly error should be an Error, but in theory anything can be thrown
  const normalizedError = error instanceof Error ? error : new Error(String(error));

  try {
    const logPromise = logger.fatal({ err: errWithCause(normalizedError), type }, 'Process got fatal error');
    await Promise.race([
      logPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Logging timed out')), FATAL_TIMEOUT_MS)),
    ]);
    await cleanup();
  } catch (loggingError) {
    console.error('Process got fatal error, and logger call timed out', {
      err: errWithCause(normalizedError),
      loggingError,
    });
  } finally {
    process.exit(1);
  }
};

process.on('uncaughtException', (err) => handleFatalError(err, 'uncaughtException'));
process.on('unhandledRejection', (reason) => handleFatalError(reason, 'unhandledRejection'));

process.on('exit', () => {
  if (!isShuttingDown) {
    logger.error('Process exiting without cleanup - this should not happen');
  }
});
