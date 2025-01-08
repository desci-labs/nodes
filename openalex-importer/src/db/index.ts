const pg = await import('pg').then((value) => value.default);
const { Pool } = pg;
import { and, eq, type ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { PgTransaction } from 'drizzle-orm/pg-core';

import * as batchesSchema from '../../drizzle/batches-schema.js';
import * as openAlexSchema from '../../drizzle/schema.js';
import { logger } from '../logger.js';
import { type DataModels } from '../transformers.js';

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

export const saveData = async (models: DataModels) => {
  logger.info('Persisting Data to database');
  const client = await pool.connect();
  const db = drizzle(client, {
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

  try {
    // todo: try to batch similary queries
    await db.transaction(async (tx) => {
      const savedBatch = await tx.insert(batchesInOpenAlex).values({}).returning({ id: batchesInOpenAlex.id });
      // Save works
      await Promise.all(
        models['works'].map(async (work) => {
          const entry = await tx
            .insert(worksInOpenalex)
            .values(work)
            .onConflictDoUpdate({ target: worksInOpenalex.id, set: work })
            .returning({ id: worksInOpenalex.id });

          await tx
            .insert(workBatchesInOpenAlex)
            .values({
              work_id: entry[0].id,
              batch_id: savedBatch[0].id,
            })
            .onConflictDoNothing({ target: workBatchesInOpenAlex.work_id });
        }),
      );

      logger.info('Works data to persisted');

      // save worksIdb
      await Promise.all([
        updateAuthors(tx, models['authors']),
        updateAuthorIds(tx, models['authors_ids']),
        updateWorkIds(tx, models['works_id']),
        updateWorksBiblio(tx, models['works_biblio']),
        updateWorksBestOaLocations(tx, models['works_best_oa_locations']),
        updateWorksPrimaryLocations(tx, models['works_primary_locations']),
        updateWorksLocations(tx, models['works_locations']),
        updateWorksOpenAccess(tx, models['works_open_access']),
        updateWorksReferencedWorks(tx, models['works_referenced_works']),
        updateWorksRelatedWorks(tx, models['works_related_works']),
        updateWorksConcepts(tx, models['works_concepts']),
        updateWorksMesh(tx, models['works_mesh']),
        updateWorksTopics(tx, models['works_topics']),
        // todo: add unique constraint [work_id, author_id] before uncommenting
        // updateWorkAuthorships(tx, models["works_authorships"]),
      ]);
    });
    logger.info('Open alex data saved');
  } catch (err) {
    logger.error({ err }, 'Error Saving data to DB');
  }
};

const updateWorkIds = async (tx: PgTransactionType, data: DataModels['works_id']) => {
  await Promise.all(
    data.map(async (entry) => {
      const duplicate = await tx
        .select()
        .from(works_idsInOpenalex)
        .where(eq(works_idsInOpenalex.work_id, entry.work_id))
        .limit(1);
      if (duplicate.length > 0) return null;
      return await tx.insert(works_idsInOpenalex).values(entry);
    }),
  );
};

const updateWorksBestOaLocations = async (tx: PgTransactionType, data: DataModels['works_best_oa_locations']) => {
  await Promise.all(
    data.map(async (entry) => {
      const duplicate = await tx
        .select()
        .from(works_best_oa_locationsInOpenalex)
        .where(eq(works_best_oa_locationsInOpenalex.work_id, entry.work_id!))
        .limit(1);
      if (duplicate.length > 0) return null;
      return await tx.insert(works_best_oa_locationsInOpenalex).values(entry);
    }),
  );
};

const updateWorksPrimaryLocations = async (tx: PgTransactionType, data: DataModels['works_primary_locations']) => {
  await Promise.all(
    data.map(async (entry) => {
      const duplicate = await tx
        .select()
        .from(works_primary_locationsInOpenalex)
        .where(eq(works_primary_locationsInOpenalex.work_id, entry.work_id!))
        .limit(1);
      if (duplicate.length > 0) return null;
      return await tx.insert(works_primary_locationsInOpenalex).values(entry);
    }),
  );
};

const updateWorksLocations = async (tx: PgTransactionType, data: DataModels['works_locations']) => {
  await Promise.all(
    data.map(async (entry) => {
      const duplicate = await tx
        .select()
        .from(works_locationsInOpenalex)
        .where(eq(works_locationsInOpenalex.landing_page_url, entry.landing_page_url!))
        .limit(1);
      if (duplicate.length > 0) return null;
      return await tx.insert(works_locationsInOpenalex).values(entry);
    }),
  );
};

const updateWorksReferencedWorks = async (tx: PgTransactionType, data: DataModels['works_referenced_works']) => {
  await Promise.all(
    data.map(async (entry) => {
      const duplicate = await tx
        .select()
        .from(works_referenced_worksInOpenalex)
        .where(
          and(
            eq(works_referenced_worksInOpenalex.work_id, entry.work_id),
            eq(works_referenced_worksInOpenalex.referenced_work_id, entry.referenced_work_id),
          ),
        )
        .limit(1);
      if (duplicate.length > 0) return null;
      return await tx.insert(works_referenced_worksInOpenalex).values(entry);
    }),
  );
};

const updateWorksRelatedWorks = async (tx: PgTransactionType, data: DataModels['works_related_works']) => {
  await Promise.all(
    data.map(async (entry) => {
      const duplicate = await tx
        .select()
        .from(works_related_worksInOpenalex)
        .where(
          and(
            eq(works_related_worksInOpenalex.work_id, entry.work_id),
            eq(works_related_worksInOpenalex.related_work_id, entry.related_work_id),
          ),
        )
        .limit(1);
      if (duplicate.length > 0) return null;
      return await tx.insert(works_related_worksInOpenalex).values(entry);
    }),
  );
};

const updateWorksOpenAccess = async (tx: PgTransactionType, data: DataModels['works_open_access']) => {
  await Promise.all(
    data.map(async (entry) => {
      const duplicate = await tx
        .select()
        .from(works_open_accessInOpenalex)
        .where(eq(works_open_accessInOpenalex.work_id, entry.work_id!))
        .limit(1);
      if (duplicate.length > 0) return null;
      return await tx.insert(works_open_accessInOpenalex).values(entry);
    }),
  );
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
  await Promise.all(
    data.map(async (entry) => {
      await tx.insert(authorsInOpenalex).values(entry).onConflictDoUpdate({
        target: authorsInOpenalex.id,
        set: entry,
      });
    }),
  );
  // logger.info("Authors data to persisted");
};

const updateAuthorIds = async (tx: PgTransactionType, data: DataModels['authors_ids']) => {
  await Promise.all(
    data.map(async (entry) => {
      const duplicate = await tx
        .select()
        .from(authors_idsInOpenalex)
        .where(eq(authors_idsInOpenalex.author_id, entry.author_id))
        .limit(1);
      if (duplicate.length > 0) return null;
      return await tx.insert(authors_idsInOpenalex).values(entry);
    }),
  );
};

const updateWorksBiblio = async (tx: PgTransactionType, data: DataModels['works_biblio']) => {
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
  await Promise.all(
    data.map(async (entry) => {
      const duplicate = await tx
        .select()
        .from(works_conceptsInOpenalex)
        .where(
          and(
            eq(works_conceptsInOpenalex.work_id, entry.work_id!),
            eq(works_conceptsInOpenalex.concept_id, entry.concept_id!),
          ),
        )
        .limit(1);
      if (duplicate.length > 0) return null;
      return await tx.insert(works_conceptsInOpenalex).values(entry);
    }),
  );
};

const updateWorksMesh = async (tx: PgTransactionType, data: DataModels['works_mesh']) => {
  await Promise.all(
    data.map(async (entry) => {
      const duplicate = await tx
        .select()
        .from(works_meshInOpenalex)
        .where(
          and(
            eq(works_meshInOpenalex.work_id, entry.work_id!),
            eq(works_meshInOpenalex.descriptor_ui, entry.descriptor_ui!),
            eq(works_meshInOpenalex.qualifier_ui, entry.qualifier_ui!),
          ),
        )
        .limit(1);
      if (duplicate.length > 0) return null;
      return await tx.insert(works_meshInOpenalex).values(entry);
    }),
  );
};

const updateWorksTopics = async (tx: PgTransactionType, data: DataModels['works_topics']) => {
  await Promise.all(
    data.map(async (entry) => {
      const duplicate = await tx
        .select()
        .from(works_topicsInOpenalex)
        .where(
          and(eq(works_topicsInOpenalex.work_id, entry.work_id!), eq(works_topicsInOpenalex.topic_id, entry.topic_id!)),
        )
        .limit(1);
      if (duplicate.length > 0) return null;
      return await tx.insert(works_topicsInOpenalex).values(entry);
    }),
  );
};
