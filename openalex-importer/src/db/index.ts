import type { QueryInfo } from './types.js';
import pgPromise from 'pg-promise';
import { logger } from '../logger.js';
import { type DataModels } from '../transformers.js';
import { UTCDate } from '@date-fns/utc';
import { addDays, startOfDay } from 'date-fns';
import * as batchesSchema from '../../drizzle/batches-schema.js';
import * as openAlexSchema from '../../drizzle/schema.js';
import { getTableConfig } from 'drizzle-orm/pg-core';
export * from '../../drizzle/schema.js';
export * from './types.js';

// Cache for ColumnSets
const columnSetCache = new Map<string, any>();

/**
 * Gets or creates a ColumnSet for a given table
 * @param table The table to get/create ColumnSet for
 * @param options Additional options for the ColumnSet
 * @returns The cached or newly created ColumnSet
 */
const getColumnSet = (table: any) => {
  const tableConfig = getTableConfig(table);
  const cacheKey = `${tableConfig.schema}.${tableConfig.name}`;

  if (!columnSetCache.has(cacheKey)) {
    columnSetCache.set(
      cacheKey,
      new pgp.helpers.ColumnSet(
        tableConfig.columns.map(c => ({
          name: c.name,
          ...(c.notNull ? {} : { def: null }),
        })),
        { table: { table: tableConfig.name, schema: tableConfig.schema! } }
      )
    );
  }

  return columnSetCache.get(cacheKey);
};

const pgp = pgPromise({
  capSQL: true, // capitalize all SQL queries
  connect: (_client) => {
    logger.info('Connected to PostgreSQL');
  },
  disconnect: (_client) => {
    logger.info('Disconnected from PostgreSQL');
  },
  error: (err, _e) => {
    logger.error({ err }, 'Database error');
  },
});

const dbInfo = {
  database: process.env.POSTGRES_DB as string,
  host: process.env.PG_HOST as string,
  user: process.env.POSTGRES_USER as string,
  port: parseInt(process.env.PG_PORT || '5432'),
  password: process.env.POSTGRES_PASSWORD as string,
  ssl: process.env.POSTGRES_NO_SSL !== 'true',
};

const { workBatchesInOpenAlex } = batchesSchema;

const {
  worksInOpenalex,
  works_idsInOpenalex,
  authorsInOpenalex,
  authors_idsInOpenalex,
  works_best_oa_locationsInOpenalex,
  works_biblioInOpenalex,
  works_locationsInOpenalex,
  works_open_accessInOpenalex,
  works_primary_locationsInOpenalex,
  works_referenced_worksInOpenalex,
  works_related_worksInOpenalex,
  works_conceptsInOpenalex,
  works_meshInOpenalex,
  works_topicsInOpenalex,
} = openAlexSchema;

logger.info(
  {
    ...dbInfo,
    password: '[REDACTED]'
  },
  'Starting postgres connection...',
);

export const db = pgp(dbInfo);

export type OaDb = typeof db;

export const createBatch = async (tx: pgPromise.ITask<any>, queryInfo: QueryInfo) => {
  const savedBatch = await tx.one(
    'INSERT INTO openalex.batch (query_type, query_from, query_to) VALUES ($1, $2, $3) RETURNING id',
    [queryInfo.query_type, queryInfo.query_from, queryInfo.query_to]
  );
  return savedBatch.id;
};

export const finalizeBatch = async (tx: pgPromise.ITask<any>, batchId: number) =>
  await tx.none('UPDATE openalex.batch SET finished_at = $1 WHERE id = $2', [new UTCDate(), batchId]);

export const saveData = async (tx: pgPromise.ITask<any>, batchId: number, models: DataModels) => {
  const counts = Object.entries(models).reduce((acc, [k, a]) => ({ ...acc, [k]: a.length}), {});
  logger.info({ counts },'Starting saveData...')

  try {
    let lap = Date.now();
    await updateWorks(tx, models['works'] , batchId);
    logger.info({  table: 'works',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateAuthors(tx, models['authors']);
    logger.info({  table: 'authors',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateAuthorIds(tx, models['authors_ids']);
    logger.info({  table: 'authorIds',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateWorkIds(tx, models['works_id']);
    logger.info({  table: 'workIds',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateWorksBiblio(tx, models['works_biblio']);
    logger.info({  table: 'worksBiblio',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateWorksBestOaLocations(tx, models['works_best_oa_locations']);
    logger.info({  table: 'worksBestOaLocation',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateWorksPrimaryLocations(tx, models['works_primary_locations']);
    logger.info({  table: 'worksPrimaryLocations',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateWorksLocations(tx, models['works_locations']);
    logger.info({  table: 'worksLocations',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateWorksOpenAccess(tx, models['works_open_access']);
    logger.info({  table: 'authorIds',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateWorksReferencedWorks(tx, models['works_referenced_works']);
    logger.info({  table: 'worksReferencedWorks',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateWorksRelatedWorks(tx, models['works_related_works']);
    logger.info({  table: 'worksRelatedWorks',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateWorksConcepts(tx, models['works_concepts']);
    logger.info({  table: 'worksConcepts',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateWorksMesh(tx, models['works_mesh']);
    logger.info({  table: 'worksMesh',  duration: Date.now() - lap }, 'Table inserts done');
    lap = Date.now();
    await updateWorksTopics(tx, models['works_topics']);
    logger.info({  table: 'worksTopics',  duration: Date.now() - lap }, 'Table inserts done');
  } catch (err) {
    logger.error({ err }, 'Error Saving data to DB');
    throw err;
  }
};

const updateWorks = async (tx: pgPromise.ITask<any>, data: DataModels['works'], batchId: number) => {
  if (!data.length) return;

  const columns = getColumnSet(worksInOpenalex);
  const query = pgp.helpers.insert(data, columns) +
    ' ON CONFLICT (id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'id' });

  await tx.none(query);

  // Insert work-batch relationships
  const batchColumns = getColumnSet(workBatchesInOpenAlex);
  const batchValues = data.map(work => ({ work_id: work.id, batch_id: batchId }));
  const batchQuery = pgp.helpers.insert(batchValues, batchColumns) + ' ON CONFLICT DO NOTHING';
  await tx.none(batchQuery);
};

const updateWorkIds = async (tx: pgPromise.ITask<any>, data: DataModels['works_id']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_idsInOpenalex);
  const query = pgp.helpers.insert(data, columns) +
    ' ON CONFLICT (work_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'work_id' });

  await tx.none(query);
};

const updateWorksBestOaLocations = async (tx: pgPromise.ITask<any>, data: DataModels['works_best_oa_locations']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_best_oa_locationsInOpenalex);
  const query = pgp.helpers.insert(data, columns) +
    ' ON CONFLICT (work_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'work_id' });

  await tx.none(query);
};

const updateWorksPrimaryLocations = async (tx: pgPromise.ITask<any>, data: DataModels['works_primary_locations']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_primary_locationsInOpenalex);
  const query = pgp.helpers.insert(data, columns) +
    ' ON CONFLICT (work_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'work_id' });

  await tx.none(query);
};

const updateWorksLocations = async (tx: pgPromise.ITask<any>, data: DataModels['works_locations']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_locationsInOpenalex);
  const query = pgp.helpers.insert(data, columns);
  await tx.none(query);
};

const updateWorksReferencedWorks = async (tx: pgPromise.ITask<any>, data: DataModels['works_referenced_works']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_referenced_worksInOpenalex);
  const query = pgp.helpers.insert(data, columns) + ' ON CONFLICT DO NOTHING';
  await tx.none(query);
};

const updateWorksRelatedWorks = async (tx: pgPromise.ITask<any>, data: DataModels['works_related_works']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_related_worksInOpenalex);
  const query = pgp.helpers.insert(data, columns) + ' ON CONFLICT DO NOTHING';
  await tx.none(query);
};

const updateWorksOpenAccess = async (tx: pgPromise.ITask<any>, data: DataModels['works_open_access']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_open_accessInOpenalex);
  const query = pgp.helpers.insert(data, columns) +
    ' ON CONFLICT (work_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'work_id' });

  await tx.none(query);
};

const updateAuthors = async (tx: pgPromise.ITask<any>, data: DataModels['authors']) => {
  if (!data.length) return;

  const columns = getColumnSet(authorsInOpenalex);
  const query = pgp.helpers.insert(data, columns) +
    ' ON CONFLICT (id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'id' });

  await tx.none(query);
};

const updateAuthorIds = async (tx: pgPromise.ITask<any>, data: DataModels['authors_ids']) => {
  if (!data.length) return;

  const columns = getColumnSet(authors_idsInOpenalex);
  const query = pgp.helpers.insert(data, columns) +
    ' ON CONFLICT (author_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'author_id' });

  await tx.none(query);
};

const updateWorksBiblio = async (tx: pgPromise.ITask<any>, data: DataModels['works_biblio']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_biblioInOpenalex);
  const query = pgp.helpers.insert(data, columns) +
    ' ON CONFLICT (work_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'work_id' });

  await tx.none(query);
};

const updateWorksConcepts = async (tx: pgPromise.ITask<any>, data: DataModels['works_concepts']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_conceptsInOpenalex);
  const query = pgp.helpers.insert(data, columns) +
    ' ON CONFLICT (concept_id, work_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: ['concept_id', 'work_id'] });

  await tx.none(query);
};

const updateWorksMesh = async (tx: pgPromise.ITask<any>, data: DataModels['works_mesh']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_meshInOpenalex);
  const query = pgp.helpers.insert(data, columns) + ' ON CONFLICT DO NOTHING';
  await tx.none(query);
};

const updateWorksTopics = async (tx: pgPromise.ITask<any>, data: DataModels['works_topics']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_topicsInOpenalex);
  const query = pgp.helpers.insert(data, columns) +
    ' ON CONFLICT (work_id, topic_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: ['work_id', 'topic_id'] });

  await tx.none(query);
};

/**
 * Returns the date AFTER the last import, i.e. the start of the first date where an import has not been run.
 */
export const getNextDayToImport = async (queryType: QueryInfo['query_type']): Promise<UTCDate> => {
  const lastBatchEnd = await db.oneOrNone(
    'SELECT query_to FROM openalex.batch WHERE query_type = $1 ORDER BY query_to DESC LIMIT 1',
    [queryType]
  );

  if (!lastBatchEnd) {
    throw new Error('Failed to get the end range from last batch');
  }

  const latestQueryTo = new UTCDate(lastBatchEnd.query_to);
  const nextDay: UTCDate = addDays(new UTCDate(latestQueryTo), 1);

  return startOfDay<UTCDate, UTCDate>(nextDay);
};
