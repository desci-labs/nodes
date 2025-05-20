import { z } from 'zod';

export const GetJournalSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val, ctx) => {
      const id = parseInt(val, 10);
      if (isNaN(id) || id <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Journal ID must be a positive integer.',
        });
        return z.NEVER;
      }
      return id;
    }),
  }),
});
