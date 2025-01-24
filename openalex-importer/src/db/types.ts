import {
  works_best_oa_locationsInOpenalex,
  works_idsInOpenalex,
  works_locationsInOpenalex,
  works_primary_locationsInOpenalex,
  worksInOpenalex,
} from '../../drizzle/schema.js';
import type { UTCDate } from '@date-fns/utc';

// filter object fields to remove undefined fields but allow null fields
type NoUndefinedField<T> = {
  [P in keyof T]-?: NoUndefinedField<T[P]>;
};

// filter object fields to remove undefined and null fields
// type NoUndefinedAndNullField<T> = {
//   [P in keyof T]-?: NoUndefinedField<NonNullable<T[P]>>;
// };

// export const worksSchema = createInsertSchema(works, { doi: z.string().optional() });
export type Works = NoUndefinedField<typeof worksInOpenalex.$inferInsert>;

// export const worksIdSchema  = createInsertSchema(worksId);
export type WorksId = NoUndefinedField<typeof works_idsInOpenalex.$inferInsert>;

export type WorksBestOaLocation = NoUndefinedField<typeof works_best_oa_locationsInOpenalex.$inferInsert>;

export type WorksPrimaryLocation = NoUndefinedField<typeof works_primary_locationsInOpenalex.$inferInsert>;

export type WorksLocation = NoUndefinedField<typeof works_locationsInOpenalex.$inferInsert>;

export type QueryInfo = {
  query_type: 'created' | 'updated',
  query_from: UTCDate,
  query_to: UTCDate,
};

