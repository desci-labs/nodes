import { errWithCause } from 'pino-std-serializers';

import { prisma } from './client.js';
import { logger as parentLogger } from './logger.js';
import { redisClient, lockService } from './redisClient.js';
import { createServer } from './server.js';
import { SubmissionQueueJob } from './workers/doiSubmissionQueue.js';

const logger = parentLogger.child({
  module: 'index.ts',
});

// Create the server instance for production
const server = createServer();

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

    // Stop accepting new requests before initialising cleanup
    new Promise((resolve, reject) => {
      server.server.close((err) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });

    await Promise.allSettled([
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

/** Handler for uncaughtException — process state is unknown after one of
 * these, so we log and then exit. This is the standard Node.js recommendation.
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

/** Handler for unhandledRejection — log it, but DO NOT crash the process.
 *
 * Historically this called handleFatalError, which exited. That turned every
 * un-try/catched upstream HTTP failure (e.g. a transient 503 from
 * ipfs.desci.com) into a full pod crash, taking down the whole desci-server
 * fleet in lockstep with any upstream hiccup. A long-running web server should
 * survive a single bad request — the offending handler should be fixed to
 * catch its own errors, but the process must keep serving traffic in the
 * meantime. Sentry still picks these up via its global integration.
 */
const handleUnhandledRejection = (reason: unknown) => {
  const normalizedError = reason instanceof Error ? reason : new Error(String(reason));
  logger.error(
    { err: errWithCause(normalizedError), type: 'unhandledRejection' },
    'Unhandled promise rejection (process continuing)',
  );
};

process.on('uncaughtException', (err) => handleFatalError(err, 'uncaughtException'));
process.on('unhandledRejection', handleUnhandledRejection);

process.on('exit', () => {
  if (!isShuttingDown) {
    logger.error('Process exiting without cleanup - this should not happen');
  }
});
