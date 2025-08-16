import { z } from 'zod';

export const internalSecretHeaderSchema = z.object({
  headers: z
    .object({
      'x-internal-secret': z.string().min(1),
    })
    .passthrough(),
});

export const getFeatureStatusSchema = internalSecretHeaderSchema.merge(
  z.object({
    query: z.object({
      userId: z.coerce.number().int().positive(),
      feature: z.enum(['REFEREE_FINDER', 'RESEARCH_ASSISTANT']),
    }),
  }),
);

export const postFeatureUsageSchema = internalSecretHeaderSchema.merge(
  z.object({
    body: z
      .object({
        userId: z.number().int().positive(),
        feature: z.enum(['REFEREE_FINDER', 'RESEARCH_ASSISTANT']),
        direction: z.enum(['increment', 'decrement']),
        usageId: z.number().int().positive().optional(),
        data: z.unknown().optional(),
      })
      .refine((b) => (b.direction === 'decrement' ? !!b.usageId : true), {
        message: 'usageId is required when direction is decrement',
        path: ['usageId'],
      }),
  }),
);

export type GetFeatureStatusSchema = z.infer<typeof getFeatureStatusSchema>;
export type PostFeatureUsageSchema = z.infer<typeof postFeatureUsageSchema>;
