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
    attestationId: z.coerce.number(),
    attestationVersionId: z.coerce.number(),
  }),
});
