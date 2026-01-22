import { EditorRole, ReviewDecision } from '@prisma/client';
import { z } from 'zod';

export const listJournalsSchema = z.object({
  query: z.object({
    participatingOnly: z.coerce
      .boolean()
      .optional()
      .describe('If true, only journals that the user is participating in will be returned.'),
  }),
});

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

export const listJournalEditorsSchema = z.object({
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
  query: z.object({
    limit: z.coerce.number().optional().default(20).describe('The number of submissions to return'),
    offset: z.coerce.number().optional().default(0).describe('The number of submissions to skip'),
    workload: z.coerce.number().optional().describe('The workload of the editors to return'),
    expertise: z.array(z.string()).optional().describe('The expertise of the editors to return'),
    sortBy: z
      .enum(['newest', 'oldest', 'workload'])
      .optional()
      .default('workload')
      .describe('The field to sort the submissions by'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc').describe('The order to sort the submissions by'),
    availability: z
      .enum(['all', 'available', 'unavailable'])
      .optional()
      .describe('The availability of the editors to return'),
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
    email: z
      .string()
      .email()
      .transform((val) => val?.toLowerCase()),
    role: z.nativeEnum(EditorRole),
    name: z.string(),
    inviteTtlDays: z
      .number()
      .int()
      .min(1, 'Invite TTL must be at least 1 day')
      .max(30, 'Invite TTL cannot exceed 30 days')
      .optional()
      .describe('Time to live for the editor invite in days (1-30 days, default: 7)'),
  }),
});

export const editorInviteDecisionSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    decision: z.enum(['accept', 'decline']),
    token: z.string(),
  }),
});

export const resendEditorInviteSchema = z.object({
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
    inviteId: z.string().transform((val, ctx) => {
      const id = parseInt(val, 10);
      if (isNaN(id) || id <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invite ID must be a positive integer.',
        });
        return z.NEVER;
      }
      return id;
    }),
  }),
  body: z.object({
    inviteTtlDays: z
      .number()
      .int()
      .min(1, 'Invite TTL must be at least 1 day')
      .max(30, 'Invite TTL cannot exceed 30 days')
      .optional()
      .describe('Time to live for the editor invite in days (1-30 days, default: 7)'),
  }),
});

export const createJournalSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Journal name cannot be empty.'),
    slug: z.string().optional().describe('The slug of the journal'),
    description: z.string().optional(),
    iconCid: z.string().optional().describe('Deprecated: use imageUrl instead'),
    imageUrl: z.string().optional().describe('URL to the journal icon/logo'),
  }),
});

export const updateEditorRoleSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
    editorUserId: z.string().transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    role: z.nativeEnum(EditorRole),
  }),
});

export const updateEditorSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
    editorUserId: z.string().transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    expertise: z.array(z.string()).optional(),
    maxWorkload: z.number().int().positive().optional(),
  }),
});

export const removeEditorSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
    editorUserId: z.string().transform((val) => parseInt(val, 10)),
  }),
});

export const updateJournalSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    name: z.string().min(1, 'Journal name cannot be empty.').optional(),
    slug: z.string().optional().describe('The slug of the journal'),
    description: z.string().optional(),
    iconCid: z.string().optional().describe('Deprecated: use imageUrl instead'),
    imageUrl: z.string().optional().describe('URL to the journal icon/logo'),
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
    status: z
      .enum([
        'new',
        'assigned',
        'under_review',
        'reviewed',
        'under_revision',
        'rejected',
        'published',
        'awaiting_decision',
      ])
      .optional()
      .describe('The status of the submissions to return'),
    startDate: z.coerce.date().optional().describe('The start date of the submissions to return'),
    endDate: z.coerce.date().optional().describe('The end date of the submissions to return'),
    assignedToMe: z.coerce
      .boolean()
      .optional()
      .default(false)
      .describe('If true, only submissions assigned to the current user as an editor will be returned'),
    sortBy: z.enum(['date', 'title']).optional().default('date').describe('The field to sort the submissions by'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc').describe('The order to sort the submissions by'),
  }),
});

export const submissionStatusCountSchema = z.object({
  params: z.object({
    journalId: z.coerce.number().describe('The ID of the journal'),
  }),
  query: z.object({
    startDate: z.coerce.date().optional().describe('The start date of the submissions to return'),
    endDate: z.coerce.date().optional().describe('The end date of the submissions to return'),
    assignedToMe: z.coerce
      .boolean()
      .nullable()
      .describe('If true, only submissions assigned to the current user as an editor will be returned'),
  }),
});

export const listFeaturedPublicationsSchema = z.object({
  params: z.object({
    journalId: z.coerce.number().optional().describe('The ID of the journal'),
  }),
  query: z.object({
    search: z.string().optional().describe('The search query to filter the submissions by'),
    limit: z.coerce.number().optional().default(20).describe('The number of submissions to return'),
    offset: z.coerce.number().optional().default(0).describe('The number of submissions to skip'),
    startDate: z.coerce.date().optional().describe('The start date of the submissions to return'),
    endDate: z.coerce.date().optional().describe('The end date of the submissions to return'),
    sortBy: z
      .enum(['newest', 'oldest', 'title', 'impact'])
      .optional()
      .default('newest')
      .describe('The field to sort the submissions by'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc').describe('The order to sort the submissions by'),
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
    // authorId: z.coerce.number().describe('The ID of the author'),
  }),
  query: z.object({
    limit: z.coerce.number().optional().default(20).describe('The number of submissions to return'),
    offset: z.coerce.number().optional().default(0).describe('The number of submissions to skip'),
  }),
});

const reviewSchema = z.object({
  editorFeedback: z.string().optional(),
  authorFeedback: z.string().optional(),
  recommendation: z.nativeEnum(ReviewDecision).optional(),
  review: z
    .array(
      z
        .object({
          question: z.string(),
          answer: z.string(),
        })
        .optional(),
    )
    .optional(),
});

export const submissionApiSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
  }),
  query: z.object({
    includeTree: z.coerce.boolean().optional().default(false),
    filterHiddenFiles: z.coerce
      .boolean()
      .optional()
      .default(true)
      .describe('Filter out .nodeKeep and .DS_Store files from the tree'),
  }),
});

export const reviewsApiSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
  }),
  query: z.object({
    limit: z.coerce.number().optional().default(20).describe('The number of submissions to return'),
    offset: z.coerce.number().optional().default(0).describe('The number of submissions to skip'),
  }),
});

export const reviewDetailsApiSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
    reviewId: z.coerce.number(),
  }),
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
    journalId: z.string(),
  }),
  body: z.object({
    refereeName: z.string().optional(),
    refereeEmail: z
      .string()
      .email()
      .optional()
      .transform((val) => val?.toLowerCase()),
    refereeUserId: z.number().int().positive().optional(),
    relativeDueDateHrs: z.number().int().positive().optional(), // lets restric tthis further.
    inviteExpiryHours: z.number().int().positive().optional(),
    expectedFormTemplateIds: z.array(z.number().int().positive()).optional().default([]),
  }),
});

export const refereeInviteDecisionSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
  }),
  body: z.object({
    token: z.string(),
    decision: z.enum(['accept', 'decline']),
    reason: z.string().optional().describe('Reason for declining the invitation (only needed for decline decisions)'),
  }),
});

export const invalidateRefereeAssignmentSchema = z.object({
  params: z.object({
    assignmentId: z.string(),
  }),
});

export const sendRefereeReviewReminderSchema = z.object({
  params: z.object({
    submissionId: z.coerce.number(),
    journalId: z.coerce.number(),
  }),
  body: z.object({
    refereeUserId: z.number().int().positive(),
  }),
});

export const submitReviewSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
    reviewId: z.coerce.number(),
  }),
  body: z.object({
    editorFeedback: z.string(),
    authorFeedback: z.string(),
    recommendation: z.nativeEnum(ReviewDecision),
    review: z.array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    ),
  }),
});

export const revisionApiSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
    revisionId: z.coerce.number(),
  }),
});

export const requestRevisionSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
  }),
  body: z.object({
    comment: z.string().optional(),
    revisionType: z.enum(['minor', 'major']),
  }),
});

export const rejectSubmissionSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
  }),
  body: z.object({
    comment: z.string().optional(),
  }),
});

export const submitRevisionSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
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

export const revisionActionSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
    revisionId: z.coerce.number(),
  }),
  body: z.object({
    decision: z.enum(['accept', 'reject']),
  }),
});

export const getReviewsByAssignmentSchema = z.object({
  params: z.object({
    assignmentId: z.coerce.number(),
  }),
  query: z.object({
    limit: z.coerce.number().optional().default(20).describe('The number of reviews to return'),
    offset: z.coerce.number().optional().default(0).describe('The number of reviews to skip'),
  }),
});

export const getAssignmentsBySubmissionSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    submissionId: z.coerce.number(),
  }),
  query: z.object({
    limit: z.coerce.number().optional().default(20).describe('The number of assignments to return'),
    offset: z.coerce.number().optional().default(0).describe('The number of assignments to skip'),
  }),
});

// Form Template Schemas
export const createFormTemplateSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
  }),
  body: z.object({
    name: z.string().min(1, 'Template name is required'),
    description: z.string().optional(),
    structure: z.object({
      sections: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          description: z.string().optional(),
          fields: z.array(
            z.object({
              id: z.string(),
              fieldType: z.enum([
                'TEXT',
                'TEXTAREA',
                'NUMBER',
                'BOOLEAN',
                'RADIO',
                'CHECKBOX',
                'SELECT',
                'SCALE',
                'RATING',
                'DATE',
              ]),
              name: z.string(),
              label: z.string(),
              description: z.string().optional(),
              required: z.boolean(),
              options: z
                .array(
                  z.object({
                    value: z.string(),
                    label: z.string(),
                  }),
                )
                .optional(),
              validation: z
                .object({
                  minLength: z.number().int().positive().optional(),
                  maxLength: z.number().int().positive().optional(),
                  min: z.number().optional(),
                  max: z.number().optional(),
                  pattern: z.string().optional(),
                })
                .optional(),
            }),
          ),
        }),
      ),
    }),
  }),
});

export const listFormTemplatesSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
  }),
  query: z.object({
    includeInactive: z.coerce.boolean().optional(),
  }),
});

export const getFormTemplateSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    templateId: z.coerce.number(),
  }),
});

export const updateFormTemplateSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    templateId: z.coerce.number(),
  }),
  body: z.object({
    name: z.string().min(1, 'Template name is required').optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
    structure: z
      .object({
        sections: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            description: z.string().optional(),
            fields: z.array(
              z.object({
                id: z.string(),
                fieldType: z.enum([
                  'TEXT',
                  'TEXTAREA',
                  'NUMBER',
                  'BOOLEAN',
                  'RADIO',
                  'CHECKBOX',
                  'SELECT',
                  'SCALE',
                  'RATING',
                  'DATE',
                ]),
                name: z.string(),
                label: z.string(),
                description: z.string().optional(),
                required: z.boolean(),
                options: z
                  .array(
                    z.object({
                      value: z.string(),
                      label: z.string(),
                    }),
                  )
                  .optional(),
                validation: z
                  .object({
                    minLength: z.number().int().positive().optional(),
                    maxLength: z.number().int().positive().optional(),
                    min: z.number().optional(),
                    max: z.number().optional(),
                    pattern: z.string().optional(),
                  })
                  .optional(),
              }),
            ),
          }),
        ),
      })
      .optional(),
  }),
});

export const getFormResponseSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    assignmentId: z.coerce.number(),
    templateId: z.coerce.number(),
  }),
});

export const saveFormResponseSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    responseId: z.coerce.number(),
  }),
  body: z.object({
    fieldResponses: z.record(
      z.string(),
      z.object({
        fieldType: z.enum([
          'TEXT',
          'TEXTAREA',
          'NUMBER',
          'BOOLEAN',
          'RADIO',
          'CHECKBOX',
          'SELECT',
          'SCALE',
          'RATING',
          'DATE',
        ]),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
      }),
    ),
  }),
});

export const submitFormResponseSchema = z.object({
  params: z.object({
    journalId: z.coerce.number(),
    responseId: z.coerce.number(),
  }),
  body: z.object({
    fieldResponses: z.record(
      z.string(),
      z.object({
        fieldType: z.enum([
          'TEXT',
          'TEXTAREA',
          'NUMBER',
          'BOOLEAN',
          'RADIO',
          'CHECKBOX',
          'SELECT',
          'SCALE',
          'RATING',
          'DATE',
        ]),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
      }),
    ),
  }),
});

export const getJournalAnalyticsSchema = z.object({
  params: z.object({
    journalId: z.coerce.number().describe('The ID of the journal to get analytics for'),
  }),
  query: z.object({
    startDate: z.string().datetime({ offset: true }).optional().describe('The start date of the analytics period'),
    endDate: z.string().datetime({ offset: true }).optional().describe('The end date of the analytics period'),
  }),
});

export const getSubmissionsSchema = z.object({
  params: z.object({
    journalId: z.coerce.number().describe('The ID of the journal to get urgent submissions for'),
  }),
  query: z.object({
    startDate: z.string().datetime({ offset: true }).optional().describe('The start date of the analytics period'),
    endDate: z.string().datetime({ offset: true }).optional().describe('The end date of the analytics period'),
  }),
});

export const getJournalSettingsSchema = z.object({
  params: z.object({
    journalId: z.coerce.number().describe('The ID of the journal to get settings for'),
  }),
});

export const MAX_REVIEW_DUE_HOURS = 2160; // 90 days
export const MAX_REFEREE_INVITE_EXPIRY_HOURS = 720; // 30 days

export const updateJournalSettingsSchema = z.object({
  params: z.object({
    journalId: z.coerce.number().describe('The ID of the journal to update settings for'),
  }),
  body: z
    .object({
      description: z.string().optional(),
      aboutArticle: z.string().optional(),
      editorialBoardArticle: z.string().optional(),
      authorInstruction: z.string().optional(),
      refereeInstruction: z.string().optional(),
      settings: z
        .object({
          reviewDueHours: z
            .object({
              min: z
                .number()
                .int()
                .min(1)
                .max(MAX_REVIEW_DUE_HOURS)
                .optional()
                .describe('Minimum review due hours (max 90 days)'),
              max: z
                .number()
                .int()
                .min(1)
                .max(MAX_REVIEW_DUE_HOURS)
                .optional()
                .describe('Maximum review due hours (max 90 days)'),
              default: z
                .number()
                .int()
                .min(1)
                .max(MAX_REVIEW_DUE_HOURS)
                .optional()
                .describe('Default review due hours (max 90 days)'),
            })
            .optional(),
          refereeInviteExpiryHours: z
            .object({
              min: z
                .number()
                .int()
                .min(1)
                .max(MAX_REFEREE_INVITE_EXPIRY_HOURS)
                .optional()
                .describe('Minimum referee invite expiry hours (max 30 days)'),
              max: z
                .number()
                .int()
                .min(1)
                .max(MAX_REFEREE_INVITE_EXPIRY_HOURS)
                .optional()
                .describe('Maximum referee invite expiry hours (max 30 days)'),
              default: z
                .number()
                .int()
                .min(1)
                .max(MAX_REFEREE_INVITE_EXPIRY_HOURS)
                .optional()
                .describe('Default referee invite expiry hours (max 30 days)'),
            })
            .optional(),
          refereeCount: z
            .object({
              value: z.number().int().min(1).max(10).optional().describe('Number of referees per submission'),
            })
            .optional(),
        })
        .optional(),
    })
    .refine(
      (data) => {
        // Validate max > min for reviewDueHours
        if (data.settings?.reviewDueHours) {
          const { min, max } = data.settings.reviewDueHours;
          if (min && max && min > max) return false;
        }
        // Validate max > min for refereeInviteExpiryHours
        if (data.settings?.refereeInviteExpiryHours) {
          const { min, max } = data.settings.refereeInviteExpiryHours;
          if (min && max && min > max) return false;
        }
        return true;
      },
      {
        message: 'Max must be greater than min',
      },
    )
    .refine(
      (data) => {
        // Validate default within min/max range for reviewDueHours
        if (data.settings?.reviewDueHours) {
          const { min, max, default: defaultVal } = data.settings.reviewDueHours;
          if (min && defaultVal && min > defaultVal) return false;
          if (max && defaultVal && defaultVal > max) return false;
        }
        // Validate default within min/max range for refereeInviteExpiryHours
        if (data.settings?.refereeInviteExpiryHours) {
          const { min, max, default: defaultVal } = data.settings.refereeInviteExpiryHours;
          if (min && defaultVal && min > defaultVal) return false;
          if (max && defaultVal && defaultVal > max) return false;
        }
        return true;
      },
      {
        message: 'Default must be between min and max',
      },
    ),
});
