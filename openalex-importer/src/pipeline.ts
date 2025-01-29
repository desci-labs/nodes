import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import {
  createBatch,
  finalizeBatch,
  getDrizzle,
  type PgTransactionType,
  type QueryInfo,
  saveData,
} from './db/index.js';
import { fetchWorksPage, filterFromQueryInfo, type FilterParam, getInitialWorksQuery } from './fetch.js';
import { appendToLogs, logger, nukeOldLogs } from './logger.js';
import { errWithCause } from 'pino-std-serializers';
import type { Work } from './types/index.js';
import { type DataModels, transformDataModel } from './transformers.js';
import { countArrayLengths, getDuration } from './util.js';
import { Writable } from 'node:stream';
import { IS_DEV, MAX_PAGES_TO_FETCH, SKIP_LOG_WRITE } from '../index.js';

const createWorksAPIStream = (filter: FilterParam): Readable => {
  let isDone = false;
  const searchQuery = getInitialWorksQuery(filter);

  // Metrics
  let pageCount = 0;
  let lastFetchEnd = Date.now();

  return new Readable({
    objectMode: true,
    highWaterMark: 5,
    async read() {
      if (isDone) {
        this.push(null);
        return;
      }

      try {
        const idleTime = Date.now() - lastFetchEnd;
        const fetchStart = Date.now();
        const { data, next_cursor } = await fetchWorksPage(searchQuery);
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
          logger.info({ pageCount }, 'Work readable done!');
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
    objectMode: true,
    transform(chunk: Work[], _encoding, callback) {
      batch.push(...chunk);
      chunks++;

      if (chunks >= targetBatchSize) {
        this.push(batch);
        batch = [];
        chunks = 0;
      }

      callback();
    },

    flush(callback) {
      if (batch.length > 0) {
        this.push(batch);
      }
      callback();
    }
  });
};

const createTransformStream = (): Transform => {
  return new Transform({
    objectMode: true,
    async transform(chunk: Work[], _encoding, callback) {
      try {
        const start = Date.now();
        const transformed: DataModels = transformDataModel(chunk);
        logger.info({ duration: getDuration(start, Date.now())}, 'Transformed chunk');
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

const createSaveStream = (tx: PgTransactionType, batchId: number): Writable => {
  return new Writable({
    objectMode: true,
    async write(chunk: DataModels, _encoding, callback) {
      try {
        const start = Date.now();
        await saveData(tx, batchId, chunk);
        logger.info({ duration: getDuration(start, Date.now())}, 'Saved chunk to database');
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });
};

export const runImportPipeline = async (queryInfo: QueryInfo): Promise<void> => {
  logger.info(queryInfo, 'Starting import pipeline');
  const startTime = Date.now();
  await nukeOldLogs();
  const filter = filterFromQueryInfo(queryInfo);

  const db = getDrizzle();
  await db.transaction(async (tx) => {
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
