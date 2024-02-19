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

export const claimAttestationSchema = z.object({
  body: z.object({
    dpid,
    nodeUuid: z.string(),
    claimerId: z.coerce.number(),
    nodeVersion: z.coerce.number(),
    attestationId: z.coerce.number(),
  }),
});

export const removeClaimSchema = z.object({
  body: z.object({
    dpid,
    nodeUuid: z.string(),
    claimId: z.coerce.number(),
    // claimerId: z.coerce.number(),
  }),
});

export const claimEntrySchema = z.object({
  body: z.object({
    dpid,
    communityId,
    nodeUuid: z.string(),
    claimerId: z.coerce.number(),
    nodeVersion: z.coerce.number(),
  }),
});
