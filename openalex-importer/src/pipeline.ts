import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import {
  createBatch,
  finalizeBatch,
  type OaDb,
  saveData,
} from './db/index.js';
import { type QueryInfo } from './db/types.js';
import { fetchWorksPage, filterFromQueryInfo, type FilterParam, getInitialWorksQuery, type Query } from './fetch.js';
import { appendToLogs, logger, nukeOldLogs } from './logger.js';
import { errWithCause } from 'pino-std-serializers';
import type { Work } from './types/index.js';
import { type DataModels, transformDataModel } from './transformers.js';
import { getDuration, sleep } from './util.js';
import { Writable } from 'node:stream';
import { IS_DEV, MAX_PAGES_TO_FETCH, SKIP_LOG_WRITE } from '../index.js';
import { RateLimiter } from './rateLimiter.js';
import * as pgPromise from 'pg-promise';

const MAX_RETRIES = 10;
const BASE_DELAY = 1_000;

const createWorksAPIStream = (filter: FilterParam): Readable => {
  let isDone = false;
  const searchQuery = getInitialWorksQuery(filter);

  // Ensure at least 100ms between writes
  const rateLimiter = new RateLimiter(120);

  const fetchWithRetry = async (query: Query) => {
    let lastError: Error | null = null;
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        return await fetchWorksPage(query);
      } catch (error) {
        lastError = error;
        retries++;

        const delayMs = BASE_DELAY * 2 ** retries;
        logger.warn({ error: errWithCause(error), retries, MAX_RETRIES, backoff: delayMs }, 'Fetch attempt failed');

        await sleep(delayMs);
      }
    }

    throw new Error(`Fetch failed after ${MAX_RETRIES} retries`, { cause: lastError });
  };

  // Metrics
  let pageCount = 0;
  let lastFetchEnd = Date.now();

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
        const { data, next_cursor } = await fetchWithRetry(searchQuery);
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

        searchQuery.cursor = next_cursor;

        if (!searchQuery.cursor) {
          isDone = true;
          logger.info({ pageCount, day: filter.from_updated_date || filter.from_created_date }, 'Work readable done!');
        }

        if (IS_DEV && pageCount >= MAX_PAGES_TO_FETCH) {
          isDone = true;
          logger.warn({ pageCount, IS_DEV, MAX_PAGES_TO_FETCH }, 'Fetch limit hit, work readable done!');
        }
      } catch (e) {
        const err = e as Error;
        logger.error(errWithCause(err), 'Work readable failed to yield');
        this.destroy(err);
      }
    },
  });
};

// Joins 5 pages into one chunk as postgres likes larger batch inserts
const createBufferStream = (targetBatchSize = 5) => {
  let batch: Work[] = [];
  let chunks = 0;

  return new Transform({
    highWaterMark: 1,
    objectMode: true,
    transform(chunk: Work[], _encoding, callback) {
      batch.push(...chunk);
      chunks++;

      if (chunks >= targetBatchSize) {
        callback(null, batch);
        batch = [];
        chunks = 0;
      } else {
        callback();
      }
    },

    flush(callback) {
      if (batch.length > 0) {
        callback(null, batch);
      } else {
        callback();
      }
    },
  });
};

const createTransformStream = (): Transform => {
  return new Transform({
    highWaterMark: 1,
    objectMode: true,
    async transform(chunk: Work[], _encoding, callback) {
      try {
        const start = Date.now();
        const transformed: DataModels = transformDataModel(chunk);
        logger.info({ duration: Date.now() - start }, 'Transformed chunk');
        callback(null, transformed);
      } catch (e) {
        const err = e as Error;
        logger.error(errWithCause(err), 'DataModel transform failed');
        callback(err);
      }
    },
  });
};

const createLogStream = (): Transform => {
  return new Transform({
    highWaterMark: 1,
    objectMode: true,
    async transform(chunk: DataModels, _encoding, callback) {
      try {
        if (IS_DEV && !SKIP_LOG_WRITE) {
          appendToLogs(chunk, 'works_raw.json');
          Object.entries(chunk).forEach(([key, content]) => appendToLogs(content, `${key}.json`));
        }

        callback(null, chunk); // Pass through the data unchanged
      } catch (error) {
        callback(error as Error);
      }
    },
  });
};

const createSaveStream = (tx: pgPromise.ITask<object>, batchId: number): Writable => {
  return new Writable({
    highWaterMark: 1,
    objectMode: true,
    async write(chunk: DataModels, _encoding, callback) {
      try {
        const start = Date.now();
        await saveData(tx, batchId, chunk);
        logger.info({ duration: Date.now() - start }, 'Saved chunk to database');
        callback();
      } catch (error) {
        logger.error(errWithCause(error as Error), 'Error saving chunk to database');
        callback(error as Error);
      }
    },
  });
};

export const runImportPipeline = async (db: OaDb, queryInfo: QueryInfo): Promise<void> => {
  logger.info(queryInfo, 'Starting import pipeline');
  const startTime = Date.now();
  await nukeOldLogs();
  const filter = filterFromQueryInfo(queryInfo);

  await db.tx(async (tx) => {
    const batchId = await createBatch(tx, queryInfo);
    await pipeline(
      createWorksAPIStream(filter),
      createBufferStream(),
      createTransformStream(),
      createLogStream(),
      createSaveStream(tx, batchId),
    );

    await finalizeBatch(tx, batchId);
  });

  const duration = getDuration(startTime, Date.now());
  logger.info({ duration: `${duration} s`, queryInfo }, 'Import pipeline finished!');
};
