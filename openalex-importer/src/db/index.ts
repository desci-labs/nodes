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
  application_name: 'openalex-importer',
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

/**
 * To minimize DB index page IO, all update functions try to sort the data by the primary key.
 * For tables with composite primary keys, the sort function acts on all columns.
 * This turns random access into index pages into sequential access, which is much faster.
 */
const sortWorks = (a: DataModels['works'][number], b: DataModels['works'][number]) => {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;

  return 0;
};

const updateWorks = async (tx: pgPromise.ITask<any>, data: DataModels['works'], batchId: number) => {
  if (!data.length) return;

  const columns = getColumnSet(worksInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortWorks), columns) +
    ' ON CONFLICT (id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'id' });

  await tx.none(query);

  // Insert work-batch relationships
  const batchColumns = getColumnSet(workBatchesInOpenAlex);
  const batchValues = data.map(work => ({ work_id: work.id, batch_id: batchId })).sort(sortByWorkId);
  const batchQuery = pgp.helpers.insert(batchValues, batchColumns) + ' ON CONFLICT DO NOTHING';
  await tx.none(batchQuery);
};

const sortByWorkId = (a: { work_id: string }, b: { work_id: string }) => {
  if (a.work_id < b.work_id) return -1;
  if (a.work_id > b.work_id) return 1;

  return 0;
};

const updateWorkIds = async (tx: pgPromise.ITask<any>, data: DataModels['works_id']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_idsInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortByWorkId), columns) +
    ' ON CONFLICT (work_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'work_id' });

  await tx.none(query);
};

const updateWorksBestOaLocations = async (tx: pgPromise.ITask<any>, data: DataModels['works_best_oa_locations']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_best_oa_locationsInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortByWorkId), columns) +
    ' ON CONFLICT (work_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'work_id' });

  await tx.none(query);
};

const updateWorksPrimaryLocations = async (tx: pgPromise.ITask<any>, data: DataModels['works_primary_locations']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_primary_locationsInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortByWorkId), columns) +
    ' ON CONFLICT (work_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'work_id' });

  await tx.none(query);
};

const updateWorksLocations = async (tx: pgPromise.ITask<any>, data: DataModels['works_locations']) => {
  if (!data.length) return;

  // Manually remove previous info before insert as there is no sane unique constraint to put on the table
  const uniqueWorkIds = [...new Set(data.map(w => w.work_id))];
  await tx.none('DELETE FROM openalex.works_locations WHERE work_id IN ($1:list)', [uniqueWorkIds]);

  const columns = getColumnSet(works_locationsInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortByWorkId), columns);
  await tx.none(query);
};

const sortWorksReferencedWorks = (a: DataModels['works_referenced_works'][number], b: DataModels['works_referenced_works'][number]) => {
  if (a.work_id! < b.work_id!) return -1;
  if (a.work_id! > b.work_id!) return 1;

  if (a.referenced_work_id! < b.referenced_work_id!) return -1;
  if (a.referenced_work_id! > b.referenced_work_id!) return 1;

  return 0;
};

const updateWorksReferencedWorks = async (tx: pgPromise.ITask<any>, data: DataModels['works_referenced_works']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_referenced_worksInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortWorksReferencedWorks), columns) + ' ON CONFLICT DO NOTHING';
  await tx.none(query);
};

const sortWorksRelatedWorks = (a: DataModels['works_related_works'][number], b: DataModels['works_related_works'][number]) => {
  if (a.work_id! < b.work_id!) return -1;
  if (a.work_id! > b.work_id!) return 1;

  if (a.related_work_id! < b.related_work_id!) return -1;
  if (a.related_work_id! > b.related_work_id!) return 1;

  return 0;
};

const updateWorksRelatedWorks = async (tx: pgPromise.ITask<any>, data: DataModels['works_related_works']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_related_worksInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortWorksRelatedWorks), columns) + ' ON CONFLICT DO NOTHING';
  await tx.none(query);
};

const updateWorksOpenAccess = async (tx: pgPromise.ITask<any>, data: DataModels['works_open_access']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_open_accessInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortByWorkId), columns) +
    ' ON CONFLICT (work_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'work_id' });

  await tx.none(query);
};

const sortAuthors = (a: DataModels['authors'][number], b: DataModels['authors'][number]) => {
  if (a.id! < b.id!) return -1;
  if (a.id! > b.id!) return 1;

  return 0;
};

const updateAuthors = async (tx: pgPromise.ITask<any>, data: DataModels['authors']) => {
  if (!data.length) return;

  const columns = getColumnSet(authorsInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortAuthors), columns) +
    ' ON CONFLICT (id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'id' });

  await tx.none(query);
};

const sortAuthorIds = (a: DataModels['authors_ids'][number], b: DataModels['authors_ids'][number]) => {
  if (a.author_id! < b.author_id!) return -1;
  if (a.author_id! > b.author_id!) return 1;

  return 0;
};

const updateAuthorIds = async (tx: pgPromise.ITask<any>, data: DataModels['authors_ids']) => {
  if (!data.length) return;

  const columns = getColumnSet(authors_idsInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortAuthorIds), columns) +
    ' ON CONFLICT (author_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'author_id' });

  await tx.none(query);
};

const updateWorksBiblio = async (tx: pgPromise.ITask<any>, data: DataModels['works_biblio']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_biblioInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortByWorkId), columns) +
    ' ON CONFLICT (work_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: 'work_id' });

  await tx.none(query);
};

const sortWorksConcepts = (a: DataModels['works_concepts'][number], b: DataModels['works_concepts'][number]) => {
  if (a.concept_id! < b.concept_id!) return -1;
  if (a.concept_id! > b.concept_id!) return 1;

  if (a.work_id! < b.work_id!) return -1;
  if (a.work_id! > b.work_id!) return 1;

  return 0;
};

const updateWorksConcepts = async (tx: pgPromise.ITask<any>, data: DataModels['works_concepts']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_conceptsInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortWorksConcepts), columns) +
    ' ON CONFLICT (concept_id, work_id) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: ['concept_id', 'work_id'] });

  await tx.none(query);
};

const sortWorksMesh = (a: DataModels['works_mesh'][number], b: DataModels['works_mesh'][number]) => {
  if (a.work_id! < b.work_id!) return -1;
  if (a.work_id! > b.work_id!) return 1;

  if (a.descriptor_ui! < b.descriptor_ui!) return -1;
  if (a.descriptor_ui! > b.descriptor_ui!) return 1;

  if (a.qualifier_ui! < b.qualifier_ui!) return -1;
  if (a.qualifier_ui! > b.qualifier_ui!) return 1;

  return 0;
};

const updateWorksMesh = async (tx: pgPromise.ITask<any>, data: DataModels['works_mesh']) => {
  if (!data.length) return;

  const columns = getColumnSet(works_meshInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortWorksMesh), columns) +
    ' ON CONFLICT (work_id, descriptor_ui, qualifier_ui) DO UPDATE SET ' +
    columns.assignColumns({ from: 'EXCLUDED', skip: ['work_id', 'descriptor_ui', 'qualifier_ui'] });
  await tx.none(query);
};

const sortWorksTopics = (a: DataModels['works_topics'][number], b: DataModels['works_topics'][number]) => {
  if (a.work_id! < b.work_id!) return -1;
  if (a.work_id! > b.work_id!) return 1;

  if (a.topic_id! < b.topic_id!) return -1;
  if (a.topic_id! > b.topic_id!) return 1;

  return 0;
};

const updateWorksTopics = async (tx: pgPromise.ITask<any>, data: DataModels['works_topics']) => {
  if (!data.length) return;
  const columns = getColumnSet(works_topicsInOpenalex);
  const query = pgp.helpers.insert(data.sort(sortWorksTopics), columns) +
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
