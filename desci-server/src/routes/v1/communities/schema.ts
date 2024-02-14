import { z } from 'zod';

export const getCommunityDetailsSchema = z.object({
  params: z.object({
    communityName: z.string().regex(/^[^\d].*/g, 'Community name cannot start with digit(s)'),
  }),
});

export const getCommunityFeedSchema = z.object({
  params: z.object({
    communityId: z.coerce.number(),
  }),
});
