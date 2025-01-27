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
import {
  fetchPage,
  type FilterParam,
  getInitialWorksQuery,
  IS_DEV,
  MAX_PAGES_TO_FETCH,
  SKIP_LOG_WRITE,
  WORKS_URL,
} from './fetch.js';
import { appendToLogs, logger } from './logger.js';
import { errWithCause } from 'pino-std-serializers';
import type { Work } from './types/index.js';
import { type DataModels, transformDataModel } from './transformers.js';
import path from 'path';
import { rimraf } from 'rimraf';
import { countArrayLengths, dropTime } from './util.js';
import { Writable } from 'node:stream';

const createWorksAPIStream = (
  filter: FilterParam
): Readable => {
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
        logger.info('Work readable done!');
        this.push(null);
        return;
      }

      try {
        const idleTime = Date.now() - lastFetchEnd;
        const fetchStart = Date.now();
        const { data, next_cursor } = await fetchPage<Work>(WORKS_URL, searchQuery);
        const fetchDuration = Date.now() - fetchStart;

        const pushStart = Date.now();
        const pushOk = this.push(data);
        const pushDuration = Date.now() - pushStart;
        lastFetchEnd = Date.now();

        pageCount++;
        logger.info({
          page: pageCount,
          fetchMs: fetchDuration,
          pushMs: pushDuration,
          idleMs: idleTime,
          bufferedPages: this.readableLength,
          pushWouldAcceptMore: pushOk,
        }, 'Work readable metrics');

        searchQuery.cursor = next_cursor;

        if (!searchQuery.cursor) {
          isDone = true;
          logger.info('Work readable done!');
        }

        if (IS_DEV && pageCount >= MAX_PAGES_TO_FETCH) {
          isDone = true;
          logger.warn({ IS_DEV, MAX_PAGES_TO_FETCH }, 'Fetch limit hit, stopping API requests');
        }
      } catch (e) {
        const err = e as Error;
        logger.error(errWithCause(err), 'Work readable failed to yield');
        this.destroy(err);
      }
    }
  });
};

const createTransformStream = (): Transform => {
  return new Transform({
    objectMode: true,
    async transform(chunk: Work[], _encoding, callback) {
      try {
        const transformed: DataModels = transformDataModel(chunk);
        logger.info(countArrayLengths(transformed), 'Transformer pushed new batch of data models');
        callback(null, transformed);
      } catch (e) {
        const err = e as Error;
        logger.error(errWithCause(err), 'DataModel transform failed');
        callback(err);
      }
    }
  });
};

const createLogStream = (): Transform => {
  return new Transform({
    objectMode: true,
    async transform(chunk: DataModels, _encoding, callback) {
      try {
        if (IS_DEV && !SKIP_LOG_WRITE) {
          appendToLogs(chunk, 'works_raw.json');
          Object.entries(chunk).forEach(
            ([key, content]) => appendToLogs(content, `${key}.json`)
          );
        }

        callback(null, chunk); // Pass through the data unchanged
      } catch (error) {
        callback(error as Error);
      }
    }
  });
};

const createSaveStream = (
  tx: PgTransactionType,
  batchId: number,
): Writable => {
  return new Writable({
    objectMode: true,
    async write(chunk: DataModels, _encoding, callback) {
      try {
        await saveData(tx, batchId, chunk);
        callback();
      } catch (error) {
        callback(error as Error);
      }
    }
  });
};

export const runImportPipeline = async (
  queryInfo: QueryInfo,
): Promise<void> => {
  const TMP_DIR = path.join(process.cwd(), 'logs');
  const rmGlob = `${TMP_DIR || 'VERY_UNLIKELY_DIR_JUST_TO_BE_SURE'}/*`;
  await rimraf(rmGlob, { glob: true });

  const { query_type, query_from, query_to } = queryInfo;
  logger.info(queryInfo, 'Running import pipeline');

  const formattedFromDate = query_from.toISOString().replace('Z','');
  const formattedToDate = query_to.toISOString().replace('Z','');

  const filter: FilterParam =
    query_type === 'created'
      ? { from_created_date: dropTime(formattedFromDate), to_created_date: dropTime(formattedToDate) }
      : { from_updated_date: formattedFromDate, to_updated_date: formattedToDate };

  const db = getDrizzle();
  await db.transaction(async (tx) => {
    const batchId = await createBatch(tx, queryInfo);
    await pipeline(
      createWorksAPIStream(filter),
      createTransformStream(),
      createLogStream(),
      createSaveStream(tx, batchId)
    );

    await finalizeBatch(tx, batchId);
  })
  logger.info('Import pipeline finished!');
};
