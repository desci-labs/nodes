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
import { chunkGenerator, getDuration, getHeapStats, logMetricsAndGetTime, maybeDumpHeap } from '../util.js';
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

type PgTransactionType = PgTransaction<
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
export function conflictUpdateAllExcept<
  T extends Table,
  E extends (keyof T['$inferInsert'])[],
>(table: T, except: E) {
  const columns = getTableColumns(table)
  const updateColumns = Object.entries(columns).filter(
    ([col]) => !except.includes(col as keyof typeof table.$inferInsert),
  )

  return updateColumns.reduce(
    (acc, [colName, table]) => ({
      ...acc,
      [colName]: sql.raw(`excluded.${table.name}`),
    }),
    {},
  ) as Omit<Record<keyof typeof table.$inferInsert, SQL>, E[number]>
}

export const saveData = async (
  models: DataModels,
  queryInfo: QueryInfo,
) => {
  logger.info('Connecting to database...');
  const startTime = Date.now();
  const client = await pool.connect();
  const db = drizzle({
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
  logger.info('Successfully connected to database, persisting data...')

  try {
    maybeDumpHeap('heap-start');
    let tPrev = logMetricsAndGetTime(startTime, 'start tx');
    await db.transaction(async (tx) => {
      const savedBatch = await tx
        .insert(batchesInOpenAlex)
        .values(queryInfo)
        .returning({ id: batchesInOpenAlex.id });
      const batchId = savedBatch[0].id;

      await updateWorks(tx, models, batchId);
      tPrev = logMetricsAndGetTime(tPrev, 'saved works')

      await updateAuthors(tx, models['authors'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved authors')

      await updateAuthorIds(tx, models['authors_ids'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved authorIds')

      await updateWorkIds(tx, models['works_id'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved workIds')

      await updateWorksBiblio(tx, models['works_biblio'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved worksBiblio')

      await updateWorksBestOaLocations(tx, models['works_best_oa_locations'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved worksBestOaLoc')

      await updateWorksPrimaryLocations(tx, models['works_primary_locations'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved worksPrimLoc')

      await updateWorksLocations(tx, models['works_locations'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved worksLoc')

      await updateWorksOpenAccess(tx, models['works_open_access'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved worksOA')

      await updateWorksReferencedWorks(tx, models['works_referenced_works'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved worksRefWorks')

      await updateWorksRelatedWorks(tx, models['works_related_works'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved worksRelWorks')

      await updateWorksConcepts(tx, models['works_concepts'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved worksConcepts')

      await updateWorksMesh(tx, models['works_mesh'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved worksMesh')

      await updateWorksTopics(tx, models['works_topics'])
      tPrev = logMetricsAndGetTime(tPrev, 'saved worksTopics')

      // todo: add unique constraint [work_id, author_id] before uncommenting
      // updateWorkAuthorships(tx, models["works_authorships"]),

      await tx.update(batchesInOpenAlex)
        .set({ finished_at: new UTCDate() })
        .where(
          eq(batchesInOpenAlex.id, batchId)
        );
    });
    tPrev = logMetricsAndGetTime(tPrev, 'end tx')
  } catch (err) {
    logger.error({ err }, 'Error Saving data to DB');
  } finally {
    logger.info({ duration: `${getDuration(startTime, Date.now())} s`}, '🏁 saveData finished')
    client.release();
  }
};

const updateWorks = async (
  tx: PgTransactionType,
  models: DataModels,
  batchId: number,
) => {
  const SET_OBJECT = conflictUpdateAllExcept(worksInOpenalex, ['id']);
  const chunkSize = 1_000;

  let chunkIx = 0;
  for await (const chunk of chunkGenerator(models.works, chunkSize)) {
    logger.info({ chunk: chunkIx, heapStats: getHeapStats() }, 'starting works chunk')

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
    chunkIx += 1;
  }
}

const updateWorkIds = async (tx: PgTransactionType, data: DataModels['works_id']) => {
  const set = conflictUpdateAllExcept(works_idsInOpenalex, ['work_id'])
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_idsInOpenalex)
      .values(chunk)
      .onConflictDoUpdate({
        target: works_idsInOpenalex.work_id,
        set,
      });
  }
};

const updateWorksBestOaLocations = async (tx: PgTransactionType, data: DataModels['works_best_oa_locations']) => {
  const set = conflictUpdateAllExcept(works_best_oa_locationsInOpenalex, ['work_id'])
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_best_oa_locationsInOpenalex)
      .values(chunk)
      .onConflictDoUpdate({
        target: works_primary_locationsInOpenalex.work_id,
        set,
      });
  }
};

const updateWorksPrimaryLocations = async (tx: PgTransactionType, data: DataModels['works_primary_locations']) => {
  const set = conflictUpdateAllExcept(works_primary_locationsInOpenalex, ['work_id'])
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_primary_locationsInOpenalex)
      .values(chunk)
      .onConflictDoUpdate({
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
    await tx.insert(works_locationsInOpenalex)
      .values(chunk);
      // .onConflictDoUpdate({
      //   target: [works_locationsInOpenalex.work_id, works_locationsInOpenalex.landing_page_url],
      //   set,
      // });
  }
};

const updateWorksReferencedWorks = async (tx: PgTransactionType, data: DataModels['works_referenced_works']) => {
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_referenced_worksInOpenalex)
      .values(chunk)
      .onConflictDoNothing();
  }
}

const _updateWorksReferencedWorks = async (tx: PgTransactionType, data: DataModels['works_referenced_works']) => {
  // Create temporary table for insert candidates (including potential duplicates)
  await tx.execute(sql`
    CREATE TEMP TABLE temp_works_referenced (
      work_id TEXT,
      referenced_work_id TEXT
    ) ON COMMIT DROP
  `);

  // Batch insert into temp table
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    const valuesExp = chunk.map(entry =>
      `('${entry.work_id}', '${entry.referenced_work_id}')`
    ).join(',');

    // Better would be to use UNNEST instead of raw values, but drizzle cant handle it
    // https://github.com/drizzle-team/drizzle-orm/issues/1589
    await tx.execute(sql`
      INSERT INTO temp_works_referenced
      VALUES ${sql.raw(valuesExp)}
    `);
  }

  // Insert non-duplicates in one go
  await tx.execute(sql`
    INSERT INTO ${works_referenced_worksInOpenalex}
      SELECT DISTINCT t.*
      FROM temp_works_referenced t
      LEFT JOIN ${works_referenced_worksInOpenalex} w
        ON t.work_id = w.work_id 
        AND t.referenced_work_id = w.referenced_work_id
      WHERE w.work_id IS NULL
  `);
}

const updateWorksRelatedWorks = async (tx: PgTransactionType, data: DataModels['works_related_works']) => {
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_related_worksInOpenalex)
      .values(chunk)
      .onConflictDoNothing();
  }
}

const _updateWorksRelatedWorks = async (tx: PgTransactionType, data: DataModels['works_related_works']) => {
  // Create temporary table for insert candidates (including potential duplicates)
  await tx.execute(sql`
    CREATE TEMP TABLE temp_works_related (
      work_id TEXT,
      related_work_id TEXT
    ) ON COMMIT DROP
  `);

  // Batch insert into temp table
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    const valuesExp = chunk.map(entry =>
      `('${entry.work_id}', '${entry.related_work_id}')`
    ).join(',');

    // Better would be to use UNNEST instead of raw values, but drizzle cant handle it
    // https://github.com/drizzle-team/drizzle-orm/issues/1589
    await tx.execute(sql`
      INSERT INTO temp_works_related
      VALUES ${sql.raw(valuesExp)}
    `);
  }

  // Insert non-duplicates in one go
  await tx.execute(sql`
    INSERT INTO ${works_related_worksInOpenalex}
      SELECT DISTINCT t.*
      FROM temp_works_related t
      LEFT JOIN ${works_related_worksInOpenalex} w
        ON t.work_id = w.work_id 
        AND t.related_work_id = w.related_work_id
      WHERE w.work_id IS NULL
  `);
}

const updateWorksOpenAccess = async (tx: PgTransactionType, data: DataModels['works_open_access']) => {
  const set = conflictUpdateAllExcept(works_open_accessInOpenalex, ['work_id'])
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx.insert(works_open_accessInOpenalex)
      .values(chunk)
      .onConflictDoUpdate({
        target: works_open_accessInOpenalex.work_id,
        set,
      });
  }
  // await Promise.all(
  //   data.map(async (entry) => {
  //     const duplicate = await tx
  //       .select()
  //       .from(works_open_accessInOpenalex)
  //       .where(eq(works_open_accessInOpenalex.work_id, entry.work_id!))
  //       .limit(1);
  //     if (duplicate.length > 0) return null;
  //     return await tx.insert(works_open_accessInOpenalex).values(entry);
  //   }),
  // );
};

const updateWorkAuthorships = async (tx: PgTransactionType, data: DataModels['works_authorships']) => {
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
    await tx
      .insert(authorsInOpenalex)
      .values(chunk)
      .onConflictDoUpdate({
        target: authorsInOpenalex.id,
        set,
      });
  }
  // await Promise.all(
  //   data.map(async (entry) => {
  //     await tx.insert(authorsInOpenalex).values(entry).onConflictDoUpdate({
  //       target: authorsInOpenalex.id,
  //       set: entry,
  //     });
  //   }),
  // );
};

const updateAuthorIds = async (tx: PgTransactionType, data: DataModels['authors_ids']) => {
  const set = conflictUpdateAllExcept(authors_idsInOpenalex, ['author_id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx
      .insert(authors_idsInOpenalex)
      .values(chunk)
      .onConflictDoUpdate({
        target: authors_idsInOpenalex.author_id,
        set,
      });
  }
}

const _updateAuthorIds = async (tx: PgTransactionType, data: DataModels['authors_ids']) => {
  // Create temporary table for insert candidates (including potential duplicates)
  await tx.execute(sql`
    CREATE TEMP TABLE temp_authors_ids (
      author_id text,
      openalex text,
      orcid text,
      scopus text,
      twitter text,
      wikipedia text,
      mag bigint
    ) ON COMMIT DROP
  `);

  // Batch insert into temp table
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    const valuesExp = chunk.map(entry =>
      `('${entry.author_id}', '${entry.openalex}', '${entry.orcid}', '${entry.scopus}', '${entry.twitter}', '${entry.wikipedia}', ${entry.mag})`
    ).join(',');

    // Better would be to use UNNEST instead of raw values, but drizzle cant handle it
    // https://github.com/drizzle-team/drizzle-orm/issues/1589
    await tx.execute(sql`
      INSERT INTO temp_authors_ids
      VALUES ${sql.raw(valuesExp)}
    `);
  }

  // Insert non-duplicates in one go
  await tx.execute(sql`
    INSERT INTO ${authors_idsInOpenalex}
      SELECT DISTINCT ON (t.author_id) t.*
      FROM temp_authors_ids t
      LEFT JOIN ${authors_idsInOpenalex} a
        ON t.author_id = a.author_id
      WHERE a.author_id IS NULL
  `);
};

/**
 * TODO: bulk upsert?
 **/
const updateWorksBiblio2 = async (tx: PgTransactionType, data: DataModels['works_biblio']) => {
  // Create temporary table for insert candidates (including potential duplicates)
  await tx.execute(sql`
    CREATE TEMP TABLE temp_works_biblio (
      work_id TEXT,
      volume TEXT,
      issue TEXT,
      first_page TEXT,
      last_page TEXT,
    ) ON COMMIT DROP
  `);

  // Batch insert into temp table
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    const valuesExp = chunk.map(entry =>
      `('${entry.work_id}', '${entry.volume}', '${entry.issue}', '${entry.first_page}', '${entry.last_page}')`
    ).join(',');

    // Better would be to use UNNEST instead of raw values, but drizzle cant handle it
    // https://github.com/drizzle-team/drizzle-orm/issues/1589
    await tx.execute(sql`
      INSERT INTO temp_works_biblio
      VALUES ${sql.raw(valuesExp)}
    `);
  }

  // Insert non-duplicates in one go
  await tx.execute(sql`
    INSERT INTO ${works_biblioInOpenalex}
      SELECT ON (t.work_id) t.*
      FROM temp_works_concepts t
    ON CONFLICT DO UPDATE
  `);
}

const updateWorksBiblio = async (tx: PgTransactionType, data: DataModels['works_biblio']) => {
  const set = conflictUpdateAllExcept(works_biblioInOpenalex, ['work_id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx
      .insert(works_biblioInOpenalex)
      .values(chunk)
      .onConflictDoUpdate({
        target: works_biblioInOpenalex.work_id,
        set,
      });
  }
}

const _updateWorksBiblio = async (tx: PgTransactionType, data: DataModels['works_biblio']) => {
  await Promise.all(
    data.map(async (entry) => {
      await tx.insert(works_biblioInOpenalex).values(entry).onConflictDoUpdate({
        target: works_biblioInOpenalex.work_id,
        set: entry,
      });
    }),
  );
};

const updateWorksConcepts = async (tx: PgTransactionType, data: DataModels['works_concepts']) => {
  const set = conflictUpdateAllExcept(works_conceptsInOpenalex, ['work_id', 'concept_id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx
      .insert(works_conceptsInOpenalex)
      .values(chunk)
      .onConflictDoUpdate({
        target: [ works_conceptsInOpenalex.work_id, works_conceptsInOpenalex.concept_id ],
        set,
      });
  }
}

const _updateWorksConcepts = async (tx: PgTransactionType, data: DataModels['works_concepts']) => {
  // Create temporary table for insert candidates (including potential duplicates)
  await tx.execute(sql`
    CREATE TEMP TABLE temp_works_concepts (
      work_id TEXT,
      concept_id TEXT,
      score REAL
    ) ON COMMIT DROP
  `);

  // Batch insert into temp table
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    const valuesExp = chunk.map(entry =>
      `('${entry.work_id}', '${entry.concept_id}', ${entry.score})`
    ).join(',');

    // Better would be to use UNNEST instead of raw values, but drizzle cant handle it
    // https://github.com/drizzle-team/drizzle-orm/issues/1589
    await tx.execute(sql`
      INSERT INTO temp_works_concepts
      VALUES ${sql.raw(valuesExp)}
    `);
  }

  // Insert non-duplicates in one go
  await tx.execute(sql`
    INSERT INTO ${works_conceptsInOpenalex}
      SELECT DISTINCT ON (t.work_id, t.concept_id) t.*
      FROM temp_works_concepts t
      LEFT JOIN ${works_conceptsInOpenalex} w
        ON t.work_id = w.work_id 
        AND t.concept_id = w.concept_id
      WHERE w.work_id IS NULL
  `);
}

const updateWorksMesh = async (tx: PgTransactionType, data: DataModels['works_mesh']) => {
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx
      .insert(works_meshInOpenalex)
      .values(chunk)
      .onConflictDoNothing();
  }
}

const _updateWorksMesh = async (tx: PgTransactionType, data: DataModels['works_mesh']) => {
  // Create temporary table for insert candidates (including potential duplicates)
  await tx.execute(sql`
    CREATE TEMP TABLE temp_works_mesh (
      work_id TEXT,
      descriptor_ui TEXT,
      descriptor_name TEXT,
      qualifier_ui TEXT,
      qualifier_name TEXT,
      is_major_topic BOOLEAN
    ) ON COMMIT DROP
  `);

  // Batch insert into temp table
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    const valuesExp = chunk.map(entry =>
      `('${entry.work_id}', '${entry.descriptor_ui}', '${entry.descriptor_name}', '${entry.qualifier_ui}', '${entry.qualifier_name}', ${entry.is_major_topic})`
    ).join(',');

    // Better would be to use UNNEST instead of raw values, but drizzle cant handle it
    // https://github.com/drizzle-team/drizzle-orm/issues/1589
    await tx.execute(sql`
      INSERT INTO temp_works_mesh
      VALUES ${sql.raw(valuesExp)}
    `);
  }

  // Insert non-duplicates in one go
  await tx.execute(sql`
    INSERT INTO ${works_meshInOpenalex}
      SELECT DISTINCT ON (t.work_id, t.descriptor_ui, t.qualifier_ui) t.*
      FROM temp_works_topics t
      LEFT JOIN ${works_meshInOpenalex} w
        ON t.work_id = w.work_id 
        AND t.descriptor_ui = w.descriptor_ui
        AND t.qualifier_ui = w.qualifier_ui
      WHERE w.work_id IS NULL
  `);
}

const updateWorksTopics = async (tx: PgTransactionType, data: DataModels['works_topics']) => {
  const set = conflictUpdateAllExcept(works_topicsInOpenalex, ['work_id', 'topic_id']);
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    await tx
      .insert(works_topicsInOpenalex)
      .values(chunk)
      .onConflictDoUpdate({
        target: [ works_topicsInOpenalex.work_id, works_topicsInOpenalex.topic_id ],
        set,
      });
  }
}

const _updateWorksTopics = async (tx: PgTransactionType, data: DataModels['works_topics']) => {
  // Create temporary table for insert candidates (including potential duplicates)
  await tx.execute(sql`
    CREATE TEMP TABLE temp_works_topics (
      work_id TEXT,
      topic_id TEXT,
      score REAL
    ) ON COMMIT DROP
  `);

  // Batch insert into temp table
  const chunkSize = 1_000;
  for await (const chunk of chunkGenerator(data, chunkSize)) {
    const valuesExp = chunk.map(entry =>
      `('${entry.work_id}', '${entry.topic_id}', ${entry.score})`
    ).join(',');

    // Better would be to use UNNEST instead of raw values, but drizzle cant handle it
    // https://github.com/drizzle-team/drizzle-orm/issues/1589
    await tx.execute(sql`
      INSERT INTO temp_works_topics
      VALUES ${sql.raw(valuesExp)}
    `);
  }

  // Insert non-duplicates in one go
  await tx.execute(sql`
    INSERT INTO ${works_topicsInOpenalex}
      SELECT DISTINCT ON (t.work_id, t.topic_id) t.*
      FROM temp_works_topics t
      LEFT JOIN ${works_topicsInOpenalex} w
        ON t.work_id = w.work_id 
        AND t.topic_id = w.concept_id
      WHERE w.work_id IS NULL
  `);
}
