// import * as pg from 'pg';

const pg = await import("pg").then((value) => value.default);
const { Pool } = pg;
import { drizzle, NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
// import { Client } from "pg";
import { DataModels } from "../transformers.js";
import { batch, workBatch, works, worksId } from "../../drizzle/schema.js";
import { PgTransaction } from "drizzle-orm/pg-core";
import { eq, ExtractTablesWithRelations } from "drizzle-orm";

export * from "../../drizzle/schema.js";
export * from "./types.js";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=public",
});

type Schema = {
  works: typeof works;
  worksId: typeof worksId;
};

type PgTransactionType = PgTransaction<
  NodePgQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>;

export const saveData = async (models: DataModels) => {
  const client = await pool.connect();
  const db = drizzle(client, { schema: { works, worksId } });

  try {
    // todo: try to batch similary queries
    await db.transaction(async (tx) => {
      const savedBatch = await tx
        .insert(batch)
        .values({})
        .returning({ id: batch.id });
      // Save works
      await Promise.all(
        models["works"].map(async (work) => {
          const entry = await tx
            .insert(works)
            .values(work)
            .onConflictDoUpdate({ target: works.id, set: work })
            .returning({ id: works.id });

          await tx
            .insert(workBatch)
            .values({
              work_id: entry[0].id,
              batch_id: savedBatch[0].id,
            })
            .onConflictDoNothing({ target: workBatch.work_id });
        })
      );

      // save worksIdb
      await updateWorkIds(tx, models["works_id"]);
    });
    console.log("Open alex data saved");
  } catch (e) {
    console.log("Error Saving data to DB", e);
  } finally {
    // client.release();
  }
};

const updateWorkIds = async (
  tx: PgTransactionType,
  data: DataModels["works_id"]
) => {
  await Promise.all(
    data.map(async (entry) => {
      const duplicate = await tx
        .select()
        .from(worksId)
        .where(eq(worksId.work_id, entry.work_id))
        .limit(1);
      // console.log("duplicate", duplicate);
      if (duplicate.length > 0) return null;
      return await tx.insert(worksId).values(entry);
    })
  );
};
