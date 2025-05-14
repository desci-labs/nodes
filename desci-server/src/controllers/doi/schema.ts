import { z } from 'zod';

export const automateManuscriptSchema = z.object({
  body: z.object({
    uuid: z.string(),
    path: z.string().startsWith('root/', 'Invalid component path').describe('Path to the PDF component in the node'),
    prepublication: z.boolean().optional().describe('Whether this is a prepublication flow'),
  }),
  params: z.object({
    // quickly disqualify false uuid strings
    uuid: z.string().min(10).describe('UUID of the node'),
  }),
});

export const retrieveDoiSchema = z.object({
  query: z
    .object({
      uuid: z.string().optional(),
      dpid: z.coerce.number().optional(),
      doi: z.string().optional(),
    })
    .refine((data) => !!data.doi || !!data.dpid || !!data.uuid, { message: 'One of UUUID, dPID or DOI is required' }),
});
