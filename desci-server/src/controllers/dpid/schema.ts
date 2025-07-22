import { z } from 'zod';

export const retrieveDpidSchema = z.object({
  params: z.object({
    dpid: z.coerce.number().int().positive().describe('DPID of the research object to retrieve'),
  }),
  query: z.object({
    version: z.coerce
      .number()
      .min(1)
      .int()
      .positive()
      .optional()
      .describe('Version of the research object metadata to retrieve. If not specified, returns the latest version.'),
  }),
});
