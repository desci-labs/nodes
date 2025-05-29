import { EditorRole, ReviewDecision } from '@prisma/client';
import { z } from 'zod';

export const getJournalSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val, ctx) => {
      const id = parseInt(val, 10);
      if (isNaN(id) || id <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Journal ID must be a positive integer.',
        });
        return z.NEVER;
      }
      return id;
    }),
  }),
});

export const inviteEditorSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val, ctx) => {
      const id = parseInt(val, 10);
      if (isNaN(id) || id <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Journal ID must be a positive integer.',
        });
        return z.NEVER;
      }
      return id;
    }),
  }),
  body: z.object({
    email: z.string().email(),
    role: z.nativeEnum(EditorRole),
  }),
});

export const editorInviteDecisionSchema = z.object({
  body: z.object({
    decision: z.enum(['accept', 'decline']),
    token: z.string(),
  }),
});

export const createJournalSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Journal name cannot be empty.'),
    description: z.string().optional(),
    iconCid: z.string().optional(),
  }),
});

export const updateEditorRoleSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
    editorId: z.string().transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    role: z.nativeEnum(EditorRole),
  }),
});

export const updateEditorSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
    editorId: z.string().transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    expertise: z.array(z.string()).optional(),
    maxWorkload: z.number().int().positive().optional(),
  }),
});

export const removeEditorSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
    editorId: z.string().transform((val) => parseInt(val, 10)),
  }),
});

export const updateJournalSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    name: z.string().min(1, 'Journal name cannot be empty.').optional(),
    description: z.string().optional(),
    iconCid: z.string().optional(),
  }),
});

export const createJournalSubmissionSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    dpid: z.coerce
      .number({ message: 'DPID must be a positive integer greater than zero' })
      .min(1, 'DPID must be a positive integer greater than zero'),
    version: z.coerce
      .number({ message: 'Version must be a positive integer greater than zero' })
      .min(1, 'Version must be a positive integer greater than zero'),
  }),
});

export const listJournalSubmissionsSchema = z.object({
  params: z.object({
    journalId: z.coerce.number().describe('The ID of the journal'),
  }),
  query: z.object({
    limit: z.coerce.number().optional().default(20).describe('The number of submissions to return'),
    offset: z.coerce.number().optional().default(0).describe('The number of submissions to skip'),
  }),
});

export const assignSubmissionToEditorSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
  }),
  body: z.object({
    editorId: z.coerce.number(),
  }),
});

export const getAuthorJournalSubmissionsSchema = z.object({
  params: z.object({
    journalId: z.coerce.number().describe('The ID of the journal'),
    authorId: z.coerce.number().describe('The ID of the author'),
  }),
  query: z.object({
    limit: z.coerce.number().optional().default(20).describe('The number of submissions to return'),
    offset: z.coerce.number().optional().default(0).describe('The number of submissions to skip'),
  }),
});

const reviewSchema = z.object({
  editorFeedback: z.string().optional(),
  authorFeedback: z.string().optional(),
  recommendation: z.nativeEnum(ReviewDecision),
  review: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    }),
  ),
});

export const createReviewSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
  }),
  body: reviewSchema,
});

export const updateReviewSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
    reviewId: z.coerce.number(),
  }),
  body: reviewSchema,
});

export const inviteRefereeSchema = z.object({
  params: z.object({
    submissionId: z.string(),
  }),
  body: z.object({
    refereeUserId: z.number().int().positive(),
    relativeDueDateHrs: z.number().int().positive().optional(), // lets restric tthis further.
  }),
});

export const refereeInviteDecisionSchema = z.object({
  body: z.object({
    token: z.string(),
    decision: z.enum(['accept', 'decline']),
  }),
});

export const invalidateRefereeAssignmentSchema = z.object({
  params: z.object({
    assignmentId: z.string(),
  }),
});
