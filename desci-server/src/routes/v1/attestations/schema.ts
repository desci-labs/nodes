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
    claimId: z.coerce.number().gt(0, 'claimId must be greater than 0'),
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

export const EMOJI_OPTIONS = z.union([z.literal('U+2705'), z.literal('U+1F914'), z.literal('U+1F440')], {
  description: 'Allowed emoji subset',
  errorMap: () => ({ message: 'Invalid Emoji unicode string' }),
});
export type Emoji = z.infer<typeof EMOJI_OPTIONS>;
export const addReactionSchema = z.object({
  body: z.object({
    claimId: z.coerce.number({ required_error: 'ClaimId is required' }),
    reaction: EMOJI_OPTIONS,
  }),
});

export const addVerificationSchema = z.object({
  body: z.object({
    claimId: z.coerce.number(),
  }),
});

export const deleteCommentSchema = z.object({
  params: z.object({ commentId: z.coerce.number() }),
});

export const deleteReactionSchema = z.object({
  params: z.object({
    reactionId: z.coerce.number(),
  }),
});

export const deleteVerificationSchema = z.object({
  params: z.object({
    verificationId: z.coerce.number(),
  }),
});

export const claimAttestationSchema = z.object({
  body: z.object({
    attestationId: z.coerce.number(),
    nodeVersion: z.coerce.number(),
    nodeUuid: z.string(),
    nodeDpid: z.string(),
    claimerId: z.coerce.number(),
  }),
});

export const claimEntryAttestationsSchema = z.object({
  body: z.object({
    communityId: z.coerce.number(),
    nodeVersion: z.coerce.number(),
    nodeUuid: z.string(),
    nodeDpid: z.string(),
    claimerId: z.coerce.number(),
  }),
});
