import { z } from 'zod';

export const automateMetadataSchema = z.object({
  body: z.object({
    uuid: z.string(),
    path: z.string().startsWith('root/', 'Invalid component path'),
    publication: z.boolean().optional(),
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
