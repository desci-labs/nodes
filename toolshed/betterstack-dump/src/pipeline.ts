import { Readable, Transform, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { appendToLogs, logger, removeIfExists } from './logger.js';
import { errWithCause } from 'pino-std-serializers';
import { RateLimiter } from './rateLimiter.js';
import type { RuntimeArgs } from './index.js';
import { buildQueryString } from './util.js';
import { fetchWithRetry } from './fetch.js';
import { existsSync } from 'fs';
import { tmpdir } from 'os';

const BASE_URL = 'https://telemetry.betterstack.com/api/v2/query/live-tail';

const createApiStream = (args: RuntimeArgs): Readable => {

  const queryParams = {
    source_ids: '286641', // kubernetes source
    query: args.query,
    batch: args.batch || 1000,
    from: args.from?.toISOString(),
    to: args.to?.toISOString(),
    order: args.order || 'oldest_first',
  };
  
  // Metrics
  let pageCount = 0;
  let lastFetchEnd = Date.now();
  let isDone = false;


  const rateLimiter = new RateLimiter(10);
  const maxPages = args.max_pages;
  let nextUrl: string | undefined = `${BASE_URL}?${buildQueryString(queryParams)}`;

  return new Readable({
    objectMode: true,
    highWaterMark: 10,
    async read() {
      if (isDone) {
        this.push(null);
        return;
      }

      try {
        await rateLimiter.waitIfNeeded();

        const idleTime = Date.now() - lastFetchEnd;
        const fetchStart = Date.now();
        const { data, next } = await fetchWithRetry(nextUrl as string);
        const fetchDuration = Date.now() - fetchStart;

        const pushStart = Date.now();
        const pushOk = this.push(data);
        const pushDuration = Date.now() - pushStart;
        lastFetchEnd = Date.now();

        pageCount++;

        logger.info(
          {
            page: pageCount,
            fetchMs: fetchDuration,
            pushMs: pushDuration,
            idleMs: idleTime,
            bufferedPages: this.readableLength,
            pushWouldAcceptMore: pushOk,
          },
          'Work readable metrics',
        );

        nextUrl = next;

        if (!nextUrl) {
          isDone = true;
          logger.info({ pageCount }, 'Work readable done!');
        }

        if (maxPages && pageCount >= maxPages) {
          isDone = true;
          logger.warn({ pageCount }, 'Fetch limit hit, work readable done!');
        }
      } catch (e) {
        const err = e as Error;
        logger.error(errWithCause(err), 'Work readable failed to yield');
        this.destroy(err);
      }
    },
  });
};

const createLogStream = (args: RuntimeArgs): Writable => {
  const filename = `${args.query}_from_${args.from?.toISOString()}_to_${args.to?.toISOString()}.json`;
  removeIfExists(filename);

  return new Writable({
    highWaterMark: 10,
    objectMode: true,
    async write(chunk: any[], _encoding, callback) {
      try {
        const start = Date.now();
        appendToLogs(chunk, filename);
        logger.info({ length: chunk.length, duration: Date.now() - start }, 'Writing batch of items');
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });
};

export const runImportPipeline = async (args: RuntimeArgs): Promise<void> => {
  logger.info(args, 'Starting import pipeline');
  const startTime = Date.now();

  await pipeline(
    createApiStream(args),
    createLogStream(args),
  );

  const duration = Math.round((Date.now() - startTime)/1_000);
  logger.info({ duration: `${duration} s`, args }, 'Import pipeline finished!');
};
