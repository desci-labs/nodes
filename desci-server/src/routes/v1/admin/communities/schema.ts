import { CommunityMembershipRole } from '@prisma/client';
import { z } from 'zod';

export const addCommunitySchema = z.object({
  body: z.object({
    name: z.string(),
    subtitle: z.string().min(1, 'Subtitle cannot be empty'),
    description: z.string().min(1, 'Description cannot be empty'),
    hidden: z.coerce
      .boolean()
      .transform((value) => (value.toString() === 'true' ? true : false))
      .default(false),
    keywords: z.array(z.string()).min(1, 'Community must have at least one keyword'),
    imageUrl: z.string().url().optional(), //"https://pub.desci.com/ipfs/bafkreie7kxhzpzhsbywcrpgyv5yvy3qxcjsibuxsnsh5olaztl2uvnrzx4",
    slug: z.string().min(3),
    links: z.array(z.string().url()),
  }),
});

export const updateCommunitySchema = z.object({
  body: z.object({
    name: z.string().optional(),
    subtitle: z.string().min(1, 'Subtitle cannot be empty').optional(),
    description: z.string().min(1, 'Description cannot be empty').optional(),
    hidden: z.coerce
      .boolean()
      .transform((value) => (value.toString() === 'true' ? true : false))
      .default(false),
    keywords: z.array(z.string()).min(1, 'Community must have at least one keyword').optional(),
    imageUrl: z.string().url().optional(), //"https://pub.desci.com/ipfs/bafkreie7kxhzpzhsbywcrpgyv5yvy3qxcjsibuxsnsh5olaztl2uvnrzx4",
    slug: z.string().min(3).optional(),
    links: z.array(z.string().url()).optional(),
  }),
  params: z.object({
    communityId: z.coerce.number(),
  }),
});

export const addAttestationSchema = z.object({
  params: z.object({
    communityId: z.coerce.number(),
  }),
  body: z.object({
    name: z.string(),
    description: z.string(),
    imageUrl: z.string().url().optional(), //"https://pub.desci.com/ipfs/bafkreie7kxhzpzhsbywcrpgyv5yvy3qxcjsibuxsnsh5olaztl2uvnrzx4",
    verifiedImageUrl: z.string().url().optional(), //"https://pub.desci.com/ipfs/bafkreie7kxhzpzhsbywcrpgyv5yvy3qxcjsibuxsnsh5olaztl2uvnrzx4",
    protected: z.coerce
      .boolean()
      .transform((value) => (value.toString() === 'true' ? true : false))
      .default(false),
  }),
});

export const updateAttestationSchema = addAttestationSchema.extend({
  params: z.object({ attestationId: z.coerce.number(), communityId: z.coerce.number() }),
});

export const addMemberSchema = z.object({
  params: z.object({
    communityId: z.string(),
  }),
  body: z.object({
    userId: z.number(),
    role: z.enum([CommunityMembershipRole.ADMIN, CommunityMembershipRole.MEMBER]),
  }),
});

export const removeMemberSchema = z.object({
  params: z.object({
    communityId: z.coerce.number(),
    memberId: z.coerce.number(),
  }),
});

export const addEntryAttestationSchema = z.object({
  params: z.object({
    communityId: z.coerce.number(),
    attestationId: z.coerce.number(),
  }),
});

export const toggleEntryAttestationSchema = z.object({
  params: z.object({
    entryId: z.coerce.number(),
  }),
});
