// TODO: Add zod schema for resource validation
import { z } from 'zod';

const communityId = z.coerce.number();
const dpid = z.coerce.number();

export const showCommunityClaimsSchema = z.object({
  params: z.object({
    communityId,
    dpid,
  }),
});

export const showNodeAttestationsSchema = z.object({
  params: z.object({
    dpid,
  }),
});
export const getAttestationReactionsSchema = z.object({
  params: z.object({
    claimId: z.coerce.number(),
  }),
});
export const getAttestationVerificationsSchema = z.object({
  params: z.object({
    claimId: z.coerce.number(),
  }),
});

export const getAttestationCommentsSchema = z.object({
  params: z.object({
    claimId: z.coerce.number(),
  }),
});

export const createCommentSchema = z.object({
  body: z.object({
    authorId: z.coerce.number(),
    claimId: z.coerce.number(),
    body: z.string(),
  }),
});

export const createAnnotationSchema = z.object({
  body: z.object({
    authorId: z.coerce.number(),
    claimId: z.coerce.number(),
    body: z.coerce.number(),
    // todo: define highlight shape
    highlight: z.object({}).optional(),
  }),
});
