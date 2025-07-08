import { z } from 'zod';

export const retrieveDpidSchema = z.object({
  params: z.object({
    dpid: z.coerce.number().describe('DPID of the research object to retrieve'),
  }),
  query: z.object({
    version: z.coerce.number().optional().describe('Version of the research object metadata to retrieve'),
  }),
});
