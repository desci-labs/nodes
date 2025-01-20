import { z } from 'zod';

import { logger } from '../../../logger.js';

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
    uuid: z.string(),
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
  query: z.object({
    cursor: z.coerce.number().optional(),
    limit: z.coerce.number().optional().default(20),
  }),
});

export const getCommentsSchema = z.object({
  params: z.object({
    // quickly disqualify false uuid strings
    uuid: z.string().min(10),
  }),
  query: z.object({
    cursor: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  }),
});

export const postCommentVoteSchema = z.object({
  params: z.object({
    // quickly disqualify false uuid strings
    uuid: z.string().min(10),
    commentId: z.coerce.number(),
  }),
});

const dpidPathRegexPlusLocalResolver =
  /^https?:\/\/(?<domain>dev-beta\.dpid\.org|beta\.dpid\.org|localhost:5460)\/(?<dpid>\d+)\/(?<version>v\d+)\/(?<path>\S+.*)?/m;

export const dpidPathRegex =
  process.env.NODE_ENV === 'dev'
    ? dpidPathRegexPlusLocalResolver
    : /^https:\/\/(?<domain>dev-beta|beta)\.dpid\.org\/(?<dpid>\d+)\/(?<version>v\d+)\/(?<path>\S+.*)?/m;

export const uuidPathRegex =
  /^https?:\/\/(?<domain>nodes-dev.desci.com|nodes.desci.com|localhost:3000)\/node\/(?<uuid>[^/^.\s]+)(?<version>\/v\d+)?(?<path>\/root.*)?/m;

export const dpidPathSchema = z
  .string()
  .url()
  .refine((link) => dpidPathRegex.test(link), { message: 'Invalid dpid link' });

export const uuidPathSchema = z
  .string()
  .url()
  .refine((link) => uuidPathRegex.test(link), { message: 'Invalid uuid link' });

export const resourcePathSchema = z
  .string()
  .url()
  .refine(
    (link) => {
      logger.info({ uuidPathRegex: uuidPathRegex.source, dpidPathRegex: dpidPathRegex.source }, 'REGEX');
      return uuidPathRegex.test(link) || dpidPathRegex.test(link);
    },
    {
      message: 'Invalid Resource link',
    },
  );

const pdfHighlightSchema = z
  .object({
    id: z.string(),
    text: z.string().optional(),
    image: z.string().optional(),
    path: resourcePathSchema,
    startX: z.coerce.number(),
    startY: z.coerce.number(),
    endX: z.coerce.number(),
    endY: z.coerce.number(),
    pageIndex: z.coerce.number(),
    rects: z.array(
      z.object({
        startX: z.coerce.number(),
        startY: z.coerce.number(),
        endX: z.coerce.number(),
        endY: z.coerce.number(),
        pageIndex: z.coerce.number(),
      }),
    ),
    kind: z.literal('pdf'),
  })
  .refine(
    (highlight) =>
      highlight.startX &&
      highlight.startY &&
      highlight.endX &&
      highlight.endY &&
      highlight.pageIndex !== null &&
      highlight.pageIndex !== undefined &&
      (highlight.text || highlight.image),
    { message: 'Invalid Pdf highlight block' },
  );

const codeHighlightSchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  path: resourcePathSchema,
  cid: z.string(),
  startLine: z.coerce.number(),
  endLine: z.coerce.number(),
  language: z.string(),
  kind: z.literal('code'),
});

const highlightBlockSchema = z.union([pdfHighlightSchema, codeHighlightSchema]);
const commentSchema = z
  .object({
    authorId: z.coerce.number(),
    claimId: z.coerce.number().optional(),
    body: z.string(),
    links: z
      .string()
      .array()
      .refine((links) => links.every((link) => dpidPathRegex.test(link)))
      .optional(),
    highlights: z.array(highlightBlockSchema).optional(),
    uuid: z.string(),
    visible: z.boolean().default(true),
  })
  .refine((comment) => comment.body?.length > 0 || !!comment?.highlights?.length, {
    message: 'Either Comment body or highlights is required',
  });

export const createCommentSchema = z.object({
  body: commentSchema,
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
    nodeDpid: z.string().optional(),
    claimerId: z.coerce.number(),
  }),
});

export const claimEntryAttestationsSchema = z.object({
  body: z.object({
    communityId: z.coerce.number(),
    nodeVersion: z.coerce.number(),
    nodeUuid: z.string(),
    nodeDpid: z.string().optional(),
    claimerId: z.coerce.number(),
  }),
});

export const removeClaimSchema = z.object({
  body: z.object({
    dpid: z.coerce.number().optional(),
    nodeUuid: z.string(),
    claimId: z.coerce.number(),
  }),
});

export const searchAttestationsSchema = z.object({
  query: z.object({
    search: z.string().optional(),
  }),
});
