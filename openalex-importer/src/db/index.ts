import type { QueryInfo } from './types.js';

const pg = await import('pg').then((value) => value.default);
const { Pool } = pg;
import { eq, type ExtractTablesWithRelations, getTableColumns, SQL, sql, type Table } from 'drizzle-orm';
import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { PgTransaction } from 'drizzle-orm/pg-core';

import * as batchesSchema from '../../drizzle/batches-schema.js';
import * as openAlexSchema from '../../drizzle/schema.js';
import { logger } from '../logger.js';
import { type DataModels } from '../transformers.js';
import { chunkGenerator } from '../util.js';
import { UTCDate } from '@date-fns/utc';

export * from '../../drizzle/schema.js';
export * from './types.js';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: '-c search_path=public',
});

const { batchesInOpenAlex, workBatchesInOpenAlex } = batchesSchema;

const {
  worksInOpenalex,
  works_idsInOpenalex,
  works_authorshipsInOpenalex,
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

type OpenAlexSchema = {
  worksInOpenalex: typeof worksInOpenalex;
  works_idsInOpenalex: typeof works_idsInOpenalex;
  batchesInOpenAlex: typeof batchesInOpenAlex;
  workBatchesInOpenAlex: typeof workBatchesInOpenAlex;
  works_authorshipsInOpenalex: typeof works_authorshipsInOpenalex;
  works_conceptsInOpenalex: typeof works_conceptsInOpenalex;
  works_meshInOpenalex: typeof works_meshInOpenalex;
  works_topicsInOpenalex: typeof works_topicsInOpenalex;
};

export type PgTransactionType = PgTransaction<
  NodePgQueryResultHKT,
  OpenAlexSchema,
  ExtractTablesWithRelations<OpenAlexSchema>
>;

/**
 * Generate an object mapping `col1: sql(excluded.col1)`, which is what postgres expects in
 * ON CONFLICT DO UPDATE statements.
 *
 * Sauce: https://github.com/drizzle-team/drizzle-orm/issues/1728#issuecomment-2289927089
 */
export function conflictUpdateAllExcept<T extends Table, E extends (keyof T['$inferInsert'])[]>(table: T, except: E) {
  const columns = getTableColumns(table);
  const updateColumns = Object.entries(columns).filter(
    ([col]) => !except.includes(col as keyof typeof table.$inferInsert),
  );

  return updateColumns.reduce(
    (acc, [colName, table]) => ({
      ...acc,
      [colName]: sql.raw(`excluded.${table.name}`),
    }),
    {},
  ) as Omit<Record<keyof typeof table.$inferInsert, SQL>, E[number]>;
}

export const getDrizzle = () => {
  return drizzle({
    client: pool,
    schema: {
      worksInOpenalex,
      works_idsInOpenalex,
      batchesInOpenAlex,
      workBatchesInOpenAlex,
      works_authorshipsInOpenalex,
      authorsInOpenalex,
      works_conceptsInOpenalex,
      works_meshInOpenalex,
      works_topicsInOpenalex,
    },
  });
};

export const createBatch = async (tx: PgTransactionType, queryInfo: QueryInfo) => {
  const savedBatch = await tx.insert(batchesInOpenAlex).values(queryInfo).returning({ id: batchesInOpenAlex.id });
  return savedBatch[0].id;
};

export const finalizeBatch = async (tx: PgTransactionType, batchId: number) =>
  await tx.update(batchesInOpenAlex).set({ finished_at: new UTCDate() }).where(eq(batchesInOpenAlex.id, batchId));

export const saveData = async (tx: PgTransactionType, batchId: number, models: DataModels) => {
  try {
    await updateWorks(tx, models, batchId);
    await updateAuthors(tx, models['authors']);
    await updateAuthorIds(tx, models['authors_ids']);
    await updateWorkIds(tx, models['works_id']);
    await updateWorksBiblio(tx, models['works_biblio']);
    await updateWorksBestOaLocations(tx, models['works_best_oa_locations']);
    await updateWorksPrimaryLocations(tx, models['works_primary_locations']);
    await updateWorksLocations(tx, models['works_locations']);
    await updateWorksOpenAccess(tx, models['works_open_access']);
    await updateWorksReferencedWorks(tx, models['works_referenced_works']);
    await updateWorksRelatedWorks(tx, models['works_related_works']);
    await updateWorksConcepts(tx, models['works_concepts']);
    await updateWorksMesh(tx, models['works_mesh']);
    await updateWorksTopics(tx, models['works_topics']);
    // todo: add unique constraint [work_id, author_id] before uncommenting
    // updateWorkAuthorships(tx, models["works_authorships"]),
  } catch (err) {
    logger.error({ err }, 'Error Saving data to DB');
  }
};

const updateWorks = async (tx: PgTransactionType, models: DataModels, batchId: number) => {
  const SET_OBJECT = conflictUpdateAllExcept(worksInOpenalex, ['id']);
  const chunkSize = 1_000;

  for await (const chunk of chunkGenerator(models.works, chunkSize)) {
    // Batch insert works and get their IDs
    const insertedWorks = await tx
      .insert(worksInOpenalex)
      .values(chunk)
      .onConflictDoUpdate({
        target: worksInOpenalex.id,
        set: SET_OBJECT,
      })
      .returning({ id: worksInOpenalex.id });

    // Batch insert work-batch relationships
    await tx
      .insert(workBatchesInOpenAlex)
      .values(
        insertedWorks.map((work) => ({
          work_id: work.id,
          batch_id: batchId,
        })),
      )
      .onConflictDoNothing({ target: [workBatchesInOpenAlex.work_id, workBatchesInOpenAlex.batch_id] });
  }
};

const updateWorkIds = async (tx: PgTransactionType, data: DataModels['works_id']) => {
  const set = conflictUpdateAllExcept(works_idsInOpenalex, ['work_id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_idsInOpenalex).values(chunk).onConflictDoUpdate({
      target: works_idsInOpenalex.work_id,
      set,
    });
  }
};

const updateWorksBestOaLocations = async (tx: PgTransactionType, data: DataModels['works_best_oa_locations']) => {
  const set = conflictUpdateAllExcept(works_best_oa_locationsInOpenalex, ['work_id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_best_oa_locationsInOpenalex).values(chunk).onConflictDoUpdate({
      target: works_primary_locationsInOpenalex.work_id,
      set,
    });
  }
};

const updateWorksPrimaryLocations = async (tx: PgTransactionType, data: DataModels['works_primary_locations']) => {
  const set = conflictUpdateAllExcept(works_primary_locationsInOpenalex, ['work_id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_primary_locationsInOpenalex).values(chunk).onConflictDoUpdate({
      target: works_primary_locationsInOpenalex.work_id,
      set,
    });
  }
};

const updateWorksLocations = async (tx: PgTransactionType, data: DataModels['works_locations']) => {
  // const set = conflictUpdateAllExcept(works_locationsInOpenalex, ['work_id'])
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    // No sensible primary key for handling collisions
    await tx.insert(works_locationsInOpenalex).values(chunk);
    // .onConflictDoUpdate({
    //   target: [works_locationsInOpenalex.work_id, works_locationsInOpenalex.landing_page_url],
    //   set,
    // });
  }
};

const updateWorksReferencedWorks = async (tx: PgTransactionType, data: DataModels['works_referenced_works']) => {
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_referenced_worksInOpenalex).values(chunk).onConflictDoNothing();
  }
};

const updateWorksRelatedWorks = async (tx: PgTransactionType, data: DataModels['works_related_works']) => {
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_related_worksInOpenalex).values(chunk).onConflictDoNothing();
  }
};

const updateWorksOpenAccess = async (tx: PgTransactionType, data: DataModels['works_open_access']) => {
  const set = conflictUpdateAllExcept(works_open_accessInOpenalex, ['work_id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_open_accessInOpenalex).values(chunk).onConflictDoUpdate({
      target: works_open_accessInOpenalex.work_id,
      set,
    });
  }
};

const _updateWorkAuthorships = async (tx: PgTransactionType, data: DataModels['works_authorships']) => {
  await Promise.all(
    data.map(async (entry) => {
      await tx
        .insert(works_authorshipsInOpenalex)
        .values(entry)
        .onConflictDoUpdate({
          target: [works_authorshipsInOpenalex.author_id, works_authorshipsInOpenalex.work_id],
          set: entry,
        });
    }),
  );
};

const updateAuthors = async (tx: PgTransactionType, data: DataModels['authors']) => {
  const set = conflictUpdateAllExcept(authorsInOpenalex, ['id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(authorsInOpenalex).values(chunk).onConflictDoUpdate({
      target: authorsInOpenalex.id,
      set,
    });
  }
};

const updateAuthorIds = async (tx: PgTransactionType, data: DataModels['authors_ids']) => {
  const set = conflictUpdateAllExcept(authors_idsInOpenalex, ['author_id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(authors_idsInOpenalex).values(chunk).onConflictDoUpdate({
      target: authors_idsInOpenalex.author_id,
      set,
    });
  }
};

const updateWorksBiblio = async (tx: PgTransactionType, data: DataModels['works_biblio']) => {
  const set = conflictUpdateAllExcept(works_biblioInOpenalex, ['work_id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_biblioInOpenalex).values(chunk).onConflictDoUpdate({
      target: works_biblioInOpenalex.work_id,
      set,
    });
  }
};

const updateWorksConcepts = async (tx: PgTransactionType, data: DataModels['works_concepts']) => {
  const set = conflictUpdateAllExcept(works_conceptsInOpenalex, ['work_id', 'concept_id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx
      .insert(works_conceptsInOpenalex)
      .values(chunk)
      .onConflictDoUpdate({
        target: [works_conceptsInOpenalex.work_id, works_conceptsInOpenalex.concept_id],
        set,
      });
  }
};

const updateWorksMesh = async (tx: PgTransactionType, data: DataModels['works_mesh']) => {
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_meshInOpenalex).values(chunk).onConflictDoNothing();
  }
};

const updateWorksTopics = async (tx: PgTransactionType, data: DataModels['works_topics']) => {
  const set = conflictUpdateAllExcept(works_topicsInOpenalex, ['work_id', 'topic_id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx
      .insert(works_topicsInOpenalex)
      .values(chunk)
      .onConflictDoUpdate({
        target: [works_topicsInOpenalex.work_id, works_topicsInOpenalex.topic_id],
        set,
      });
  }
};
