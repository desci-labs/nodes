import { CommunityMembershipRole } from '@prisma/client';
import { z } from 'zod';

export const addCommunitySchema = z.object({
  body: z.object({
    name: z.string(),
    subtitle: z.string().min(1, 'Subtitle cannot be empty'),
    description: z.string().min(1, 'Description cannot be empty'),
    hidden: z.boolean().default(false),
    keywords: z.array(z.string()).min(1, 'Community must have at least one keyword'),
    imageUrl: z.string().url().optional(), //"https://pub.desci.com/ipfs/bafkreie7kxhzpzhsbywcrpgyv5yvy3qxcjsibuxsnsh5olaztl2uvnrzx4",
    slug: z.string().min(3),
    links: z.array(z.string().url()),
  }),
});

export const addAttestationSchema = z.object({
  params: z.object({
    communityId: z.coerce.number(),
  }),
  body: z.object({
    name: z.string(),
    communitySlug: z.string(),
    description: z.string(),
    imageUrl: z.string().url().optional(), //"https://pub.desci.com/ipfs/bafkreie7kxhzpzhsbywcrpgyv5yvy3qxcjsibuxsnsh5olaztl2uvnrzx4",
    verifiedImageUrl: z.string().url().optional(), //"https://pub.desci.com/ipfs/bafkreie7kxhzpzhsbywcrpgyv5yvy3qxcjsibuxsnsh5olaztl2uvnrzx4",
    protected: z.boolean().default(false),
  }),
});

export const addMemberSchema = z.object({
  params: z.object({
    communityId: z.coerce.number(),
  }),
  body: z.object({
    userId: z.coerce.number(),
    role: z.enum([CommunityMembershipRole.ADMIN, CommunityMembershipRole.MEMBER]),
  }),
});

export const removeMemberSchema = z.object({
  params: z.object({
    communityId: z.coerce.number(),
  }),
  body: z.object({
    memberId: z.coerce.number(),
  }),
});

export const addEntryAttestationSchema = z.object({
  params: z.object({
    communityId: z.coerce.number(),
  }),
  body: z.object({
    attestationId: z.coerce.number(),
  }),
});

export const removeEntryAttestationSchema = z.object({
  params: z.object({
    communityId: z.coerce.number(),
  }),
  body: z.object({
    attestationId: z.coerce.number(),
  }),
});
