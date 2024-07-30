import { works, worksId } from "../../drizzle/schema.js";

// filter object fields to remove undefined fields but allow null fields
type NoUndefinedField<T> = {
  [P in keyof T]-?: NoUndefinedField<T[P]>;
};

// filter object fields to remove undefined and null fields
// type NoUndefinedAndNullField<T> = {
//   [P in keyof T]-?: NoUndefinedField<NonNullable<T[P]>>;
// };

// export const worksSchema = createInsertSchema(works, { doi: z.string().optional() });
export type Works = NoUndefinedField<typeof works.$inferInsert>;

// export const worksIdSchema  = createInsertSchema(worksId);
export type WorksId = NoUndefinedField<typeof worksId.$inferInsert>;
