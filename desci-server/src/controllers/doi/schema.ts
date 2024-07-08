import { z } from 'zod';

export const attachDoiSchema = z.object({
  body: z.object({
    uuid: z.string(),
    path: z.string().startsWith('root/', 'Invalid component path'),
    publication: z.boolean().optional(),
  }),
});
