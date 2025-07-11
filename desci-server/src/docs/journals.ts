import { z } from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

import { getJournalAnalyticsSchema, showUrgentSubmissionsSchema } from '../schemas/journals.schema.js';
import {
  getJournalSchema,
  inviteEditorSchema,
  editorInviteDecisionSchema,
  createJournalSchema,
  updateEditorRoleSchema,
  removeEditorSchema,
  updateJournalSchema,
  createJournalSubmissionSchema,
  listJournalSubmissionsSchema,
  assignSubmissionToEditorSchema,
  getAuthorJournalSubmissionsSchema,
  reviewsApiSchema,
  reviewDetailsApiSchema,
  requestRevisionSchema,
  submissionApiSchema,
  rejectSubmissionSchema,
  submitRevisionSchema,
  revisionApiSchema,
  revisionActionSchema,
  listJournalsSchema,
  listJournalEditorsSchema,
  updateEditorSchema,
  createReviewSchema,
  updateReviewSchema,
  submitReviewSchema,
  createFormTemplateSchema,
  listFormTemplatesSchema,
  getFormTemplateSchema,
  updateFormTemplateSchema,
  getFormResponseSchema,
  saveFormResponseSchema,
  submitFormResponseSchema,
  inviteRefereeSchema,
  refereeInviteDecisionSchema,
  invalidateRefereeAssignmentSchema,
} from '../schemas/journals.schema.js';

// List Journals
export const listJournalsOperation: ZodOpenApiOperationObject = {
  operationId: 'listJournals',
  tags: ['Journals'],
  summary: 'List all journals',
  requestParams: { query: listJournalsSchema.shape.query },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            journals: z.array(
              z.object({
                id: z.number(),
                name: z.string(),
                description: z.string().nullable(),
                iconCid: z.string().nullable(),
                createdAt: z.string(),
              }),
            ),
          }),
        },
      },
    },
  },
};

// Show Journal
export const showJournalOperation: ZodOpenApiOperationObject = {
  operationId: 'showJournal',
  tags: ['Journals'],
  summary: 'Get a journal by ID',
  requestParams: { path: getJournalSchema.shape.params },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            journal: z.object({
              id: z.number(),
              name: z.string(),
              description: z.string().nullable(),
              iconCid: z.string().nullable(),
              createdAt: z.string(),
              editors: z.array(
                z.object({
                  id: z.number(),
                  name: z.string().nullable(),
                  email: z.string().nullable(),
                  orcid: z.string().nullable(),
                }),
              ),
            }),
          }),
        },
      },
    },
    '404': {
      description: 'Journal not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
};

// Create Journal
export const createJournalOperation: ZodOpenApiOperationObject = {
  operationId: 'createJournal',
  tags: ['Journals'],
  summary: 'Create a new journal',
  requestBody: {
    content: {
      'application/json': {
        schema: createJournalSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Journal created successfully',
      content: {
        'application/json': {
          schema: z.object({
            journal: z.object({
              id: z.number(),
              name: z.string(),
              description: z.string().nullable(),
              iconCid: z.string().nullable(),
              createdAt: z.string(),
            }),
          }),
        },
      },
    },
    '409': {
      description: 'Conflict (journal already exists)',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Update Journal
export const updateJournalOperation: ZodOpenApiOperationObject = {
  operationId: 'updateJournal',
  tags: ['Journals'],
  summary: 'Update a journal',
  requestParams: { path: updateJournalSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: updateJournalSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Journal updated successfully',
      content: {
        'application/json': {
          schema: z.object({
            journal: z.object({
              id: z.number(),
              name: z.string(),
              description: z.string().nullable(),
              iconCid: z.string().nullable(),
              createdAt: z.string(),
            }),
          }),
        },
      },
    },
    '404': {
      description: 'Journal not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '409': {
      description: 'Conflict (journal name in use)',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Invite Editor
export const inviteEditorOperation: ZodOpenApiOperationObject = {
  operationId: 'inviteEditor',
  tags: ['Journals'],
  summary: 'Invite an editor to a journal',
  requestParams: { path: inviteEditorSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: inviteEditorSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Editor invited successfully',
      content: {
        'application/json': {
          schema: z.object({ invite: z.object({}) }), // Details omitted for brevity
        },
      },
    },
    '404': {
      description: 'Journal not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Accept/Decline Editor Invite
export const editorInviteDecisionOperation: ZodOpenApiOperationObject = {
  operationId: 'editorInviteDecision',
  tags: ['Journals'],
  summary: 'Accept or decline an editor invitation',
  requestParams: { path: editorInviteDecisionSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: editorInviteDecisionSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Invite decision processed',
      content: {
        'application/json': {
          schema: z.object({ invite: z.object({}) }), // Details omitted for brevity
        },
      },
    },
    '400': {
      description: 'Invalid or expired invite',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
};

// List Journal Editors
export const listJournalEditorsOperation: ZodOpenApiOperationObject = {
  operationId: 'listJournalEditors',
  tags: ['Journals'],
  summary: 'List all editors for a journal',
  requestParams: {
    path: listJournalEditorsSchema.shape.params,
    query: listJournalEditorsSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Journal editors retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              id: z.number(),
              userId: z.number(),
              journalId: z.number(),
              role: z.enum(['CHIEF_EDITOR', 'ASSOCIATE_EDITOR']),
              invitedAt: z.string(),
              acceptedAt: z.string().nullable(),
              expertise: z.array(z.string()).nullable(),
              maxWorkload: z.number().nullable(),
              currentWorkload: z.number(),
              available: z.boolean(),
              user: z.object({
                id: z.number(),
                name: z.string().nullable(),
                orcid: z.string().nullable(),
              }),
            }),
          ),
        },
      },
    },
    '403': {
      description: 'Not authorized to view journal editors',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '404': {
      description: 'Journal not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Remove Editor
export const removeEditorOperation: ZodOpenApiOperationObject = {
  operationId: 'removeEditor',
  tags: ['Journals'],
  summary: 'Remove an editor from a journal',
  requestParams: { path: removeEditorSchema.shape.params },
  responses: {
    '200': {
      description: 'Editor removed successfully',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    '404': {
      description: 'Editor not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Cannot remove yourself as CHIEF_EDITOR',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Update Editor Role
export const updateEditorRoleOperation: ZodOpenApiOperationObject = {
  operationId: 'updateEditorRole',
  tags: ['Journals'],
  summary: 'Update an editor role in a journal',
  requestParams: { path: updateEditorRoleSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: updateEditorRoleSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Editor role updated successfully',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    '404': {
      description: 'Editor not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Cannot demote yourself',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Update Editor Settings
export const updateEditorOperation: ZodOpenApiOperationObject = {
  operationId: 'updateEditor',
  tags: ['Journals'],
  summary: 'Update editor settings (expertise, workload)',
  requestParams: { path: updateEditorSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: updateEditorSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Editor settings updated successfully',
      content: {
        'application/json': {
          schema: z.object({
            editor: z.object({
              id: z.number(),
              userId: z.number(),
              role: z.enum(['CHIEF_EDITOR', 'ASSOCIATE_EDITOR']),
              expertise: z.array(z.string()).nullable(),
              maxWorkload: z.number().nullable(),
            }),
          }),
        },
      },
    },
    '404': {
      description: 'Editor not found in this journal',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Create Journal Submission
export const createJournalSubmissionOperation: ZodOpenApiOperationObject = {
  operationId: 'createJournalSubmission',
  tags: ['Journals'],
  summary: 'Create a submission for a journal',
  requestParams: { path: createJournalSubmissionSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: createJournalSubmissionSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Submission created successfully',
      content: {
        'application/json': {
          schema: z.object({ submissionId: z.number() }),
        },
      },
    },
    '404': {
      description: 'Node or version not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '500': {
      description: 'Failed to create submission',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// List Journal Submissions
export const listJournalSubmissionsOperation: ZodOpenApiOperationObject = {
  operationId: 'listJournalSubmissions',
  tags: ['Journals'],
  summary: 'List submissions for a journal',
  requestParams: { path: listJournalSubmissionsSchema.shape.params, query: listJournalSubmissionsSchema.shape.query },
  responses: {
    '200': {
      description: 'Submissions retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            submissions: z.array(
              z.object({
                id: z.number(),
                assignedEditorId: z.number().nullable(),
                dpid: z.number(),
                version: z.number(),
                status: z.string(),
                submittedAt: z.string().nullable(),
                acceptedAt: z.string().nullable(),
                rejectedAt: z.string().nullable(),
                doiMintedAt: z.string().nullable(),
                doi: z.string().nullable(),
                author: z
                  .object({
                    id: z.number(),
                    name: z.string().nullable(),
                    email: z.string().nullable(),
                    orcid: z.string().nullable(),
                  })
                  .nullable(),
                assignedEditor: z
                  .object({
                    id: z.number(),
                    name: z.string().nullable(),
                    email: z.string().nullable(),
                    orcid: z.string().nullable(),
                  })
                  .nullable(),
              }),
            ),
            meta: z.object({ count: z.number(), limit: z.number(), offset: z.number() }),
          }),
        },
      },
    },
    '404': {
      description: 'Editor not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Get Author Journal Submissions
export const getAuthorJournalSubmissionsOperation: ZodOpenApiOperationObject = {
  operationId: 'getAuthorJournalSubmissions',
  tags: ['Journals'],
  summary: 'List submissions for a journal by the current author',
  requestParams: {
    path: getAuthorJournalSubmissionsSchema.shape.params,
    query: getAuthorJournalSubmissionsSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Submissions retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(
              z.object({
                journal: z.object({
                  id: z.number(),
                  name: z.string(),
                }),
                dpid: z.number(),
                version: z.number(),
                status: z.string(),
                id: z.number(),
                authorId: z.number(),
                assignedEditorId: z.number().nullable(),
                assignedEditor: z
                  .object({
                    id: z.number(),
                    name: z.string().nullable(),
                    email: z.string().nullable(),
                    orcid: z.string().nullable(),
                  })
                  .nullable(),
              }),
            ),
            meta: z.object({ count: z.number(), limit: z.number(), offset: z.number() }),
          }),
        },
      },
    },
    '404': {
      description: 'Failed to retrieve submissions',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Assign Submission to Editor
export const assignSubmissionToEditorOperation: ZodOpenApiOperationObject = {
  operationId: 'assignSubmissionToEditor',
  tags: ['Journals'],
  summary: 'Assign a submission to an editor',
  requestParams: { path: assignSubmissionToEditorSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: assignSubmissionToEditorSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Submission assigned successfully',
      content: {
        'application/json': {
          schema: z.object({
            submission: z.object({ id: z.number(), assignedEditorId: z.number(), status: z.string() }),
          }),
        },
      },
    },
    '404': {
      description: 'Editor or submission not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Only chief editor can assign submissions',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '500': {
      description: 'Failed to assign submission',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// List Submission Reviews
export const listSubmissionReviewsOperation: ZodOpenApiOperationObject = {
  operationId: 'listSubmissionReviews',
  tags: ['Journals'],
  summary: 'List all reviews for a submission',
  requestParams: {
    path: reviewsApiSchema.shape.params,
    query: reviewsApiSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Reviews retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            reviews: z.array(
              z.object({
                id: z.number(),
                editorFeedback: z.string().nullable(),
                authorFeedback: z.string().nullable(),
                recommendation: z.string().nullable(),
                createdAt: z.string(),
                updatedAt: z.string(),
                editor: z.object({
                  id: z.number(),
                  name: z.string().nullable(),
                  email: z.string().nullable(),
                  orcid: z.string().nullable(),
                }),
                review: z.array(
                  z.object({
                    question: z.string(),
                    answer: z.string(),
                  }),
                ),
              }),
            ),
            meta: z.object({
              count: z.number(),
              limit: z.number(),
              offset: z.number(),
            }),
          }),
        },
      },
    },
    '404': {
      description: 'Submission not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Get Review Details
export const getReviewDetailsOperation: ZodOpenApiOperationObject = {
  operationId: 'getReviewDetails',
  tags: ['Journals'],
  summary: 'Get details of a specific review',
  requestParams: { path: reviewDetailsApiSchema.shape.params },
  responses: {
    '200': {
      description: 'Review details retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            review: z.object({
              id: z.number(),
              editorFeedback: z.string().nullable(),
              authorFeedback: z.string().nullable(),
              recommendation: z.string().nullable(),
              createdAt: z.string(),
              updatedAt: z.string(),
              editor: z.object({
                id: z.number(),
                name: z.string().nullable(),
                email: z.string().nullable(),
                orcid: z.string().nullable(),
              }),
              review: z.array(
                z.object({
                  question: z.string(),
                  answer: z.string(),
                }),
              ),
            }),
          }),
        },
      },
    },
    '404': {
      description: 'Review not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Create Review
export const createReviewOperation: ZodOpenApiOperationObject = {
  operationId: 'createReview',
  tags: ['Journals'],
  summary: 'Create a new review for a submission',
  requestParams: {
    path: z.object({
      journalId: z.coerce.number(),
      submissionId: z.coerce.number(),
    }),
  },
  requestBody: {
    content: {
      'application/json': {
        schema: createReviewSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Review created successfully',
      content: {
        'application/json': {
          schema: z.object({
            review: z.object({
              id: z.number(),
              editorFeedback: z.string().nullable(),
              authorFeedback: z.string().nullable(),
              recommendation: z.string().nullable(),
              createdAt: z.string(),
              updatedAt: z.string(),
              editor: z.object({
                id: z.number(),
                name: z.string().nullable(),
                email: z.string().nullable(),
                orcid: z.string().nullable(),
              }),
              review: z.array(
                z.object({
                  question: z.string(),
                  answer: z.string(),
                }),
              ),
            }),
          }),
        },
      },
    },
    '404': {
      description: 'Submission not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Not authorized to create review',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Update Review
export const updateReviewOperation: ZodOpenApiOperationObject = {
  operationId: 'updateReview',
  tags: ['Journals'],
  summary: 'Update an existing review',
  requestParams: {
    path: z.object({
      journalId: z.coerce.number(),
      submissionId: z.coerce.number(),
      reviewId: z.coerce.number(),
    }),
  },
  requestBody: {
    content: {
      'application/json': {
        schema: updateReviewSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Review updated successfully',
      content: {
        'application/json': {
          schema: z.object({
            review: z.object({
              id: z.number(),
              editorFeedback: z.string().nullable(),
              authorFeedback: z.string().nullable(),
              recommendation: z.string().nullable(),
              createdAt: z.string(),
              updatedAt: z.string(),
              editor: z.object({
                id: z.number(),
                name: z.string().nullable(),
                email: z.string().nullable(),
                orcid: z.string().nullable(),
              }),
              review: z.array(
                z.object({
                  question: z.string(),
                  answer: z.string(),
                }),
              ),
            }),
          }),
        },
      },
    },
    '404': {
      description: 'Review not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Not authorized to update review',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Submit Review
export const submitReviewOperation: ZodOpenApiOperationObject = {
  operationId: 'submitReview',
  tags: ['Journals'],
  summary: 'Submit a completed review',
  requestParams: {
    path: z.object({
      journalId: z.coerce.number(),
      submissionId: z.coerce.number(),
      reviewId: z.coerce.number(),
    }),
  },
  requestBody: {
    content: {
      'application/json': {
        schema: submitReviewSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Review submitted successfully',
      content: {
        'application/json': {
          schema: z.object({
            review: z.object({
              id: z.number(),
              editorFeedback: z.string(),
              recommendation: z.string(),
              submittedAt: z.string(),
              editor: z.object({
                id: z.number(),
                name: z.string().nullable(),
                email: z.string().nullable(),
                orcid: z.string().nullable(),
              }),
              review: z.array(
                z.object({
                  question: z.string(),
                  answer: z.string(),
                }),
              ),
            }),
          }),
        },
      },
    },
    '404': {
      description: 'Review not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Not authorized to submit review',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '400': {
      description: 'Invalid review submission',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Request Revision
export const requestRevisionOperation: ZodOpenApiOperationObject = {
  operationId: 'requestRevision',
  tags: ['Journals'],
  summary: 'Request a revision for a submission',
  requestParams: { path: requestRevisionSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: requestRevisionSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Revision requested successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
          }),
        },
      },
    },
    '403': {
      description: 'Forbidden - Not a journal editor',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    '404': {
      description: 'Submission not found',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Accept Submission
export const acceptSubmissionOperation: ZodOpenApiOperationObject = {
  operationId: 'acceptSubmission',
  tags: ['Journals'],
  summary: 'Accept a submission',
  requestParams: { path: submissionApiSchema.shape.params },
  responses: {
    '200': {
      description: 'Submission accepted successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
          }),
        },
      },
    },
    '403': {
      description: 'Forbidden - Not a journal editor',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    '404': {
      description: 'Submission not found',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Reject Submission
export const rejectSubmissionOperation: ZodOpenApiOperationObject = {
  operationId: 'rejectSubmission',
  tags: ['Journals'],
  summary: 'Reject a submission',
  requestParams: { path: rejectSubmissionSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: rejectSubmissionSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Submission rejected successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
          }),
        },
      },
    },
    '403': {
      description: 'Forbidden - Not a journal editor',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    '404': {
      description: 'Submission not found',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Submit Revision
export const submitRevisionOperation: ZodOpenApiOperationObject = {
  operationId: 'submitRevision',
  tags: ['Journals'],
  summary: 'Submit a revision for a submission',
  requestParams: { path: submitRevisionSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: submitRevisionSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Revision submitted successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
            data: z.object({
              id: z.number(),
              submissionId: z.number(),
              dpid: z.number(),
              version: z.number(),
              status: z.string(),
              createdAt: z.string(),
            }),
          }),
        },
      },
    },
    '403': {
      description: 'Forbidden - User is not the author of the submission',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    '404': {
      description: 'Submission or node not found',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Get Journal Submission
export const getJournalSubmissionOperation: ZodOpenApiOperationObject = {
  operationId: 'getJournalSubmission',
  tags: ['Journals'],
  summary: 'Get details of a specific journal submission',
  description:
    'Retrieve comprehensive details of a journal submission including research object information, author details, and assigned editor information. Optionally include the published file tree structure.',
  requestParams: {
    path: submissionApiSchema.shape.params,
    query: submissionApiSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Submission details retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
            data: z.object({
              id: z.number(),
              journalId: z.number(),
              authorId: z.number(),
              assignedEditorId: z.number().nullable(),
              dpid: z.number(),
              version: z.number(),
              status: z.string(),
              submittedAt: z.string().nullable(),
              acceptedAt: z.string().nullable(),
              rejectedAt: z.string().nullable(),
              doiMintedAt: z.string().nullable(),
              doi: z.string().nullable(),
              journal: z.object({
                id: z.number(),
                name: z.string(),
              }),
              author: z.object({
                name: z.string().nullable(),
                id: z.number(),
                orcid: z.string().nullable(),
              }),
              assignedEditor: z
                .object({
                  id: z.number(),
                  name: z.string().nullable(),
                  orcid: z.string().nullable(),
                })
                .nullable(),
              researchObject: z.object({
                title: z.string(),
                uuid: z.string(),
                doi: z.string().nullable(),
                manifest: z.object({
                  version: z.string(),
                  title: z.string(),
                  authors: z.array(
                    z.object({
                      name: z.string(),
                      role: z.string(),
                      orcid: z.string().nullable(),
                    }),
                  ),
                  description: z.string(),
                  components: z.array(z.object({}).passthrough()),
                }),
              }),
              tree: z
                .array(
                  z.object({
                    uid: z.string().optional(),
                    name: z.string(),
                    lastModified: z.string(),
                    componentType: z.enum([
                      'data-bucket',
                      'unknown',
                      'pdf',
                      'code',
                      'video',
                      'terminal',
                      'data',
                      'link',
                      'manifest',
                    ]),
                    componentSubtype: z.string().optional(),
                    componentId: z.string().optional(),
                    accessStatus: z.enum(['Public', 'Private', 'Partial', 'External']),
                    size: z.number(),
                    metadata: z
                      .object({
                        title: z.string().optional(),
                        description: z.string().optional(),
                        keywords: z.array(z.string()).optional(),
                        licenseType: z.string().optional(),
                        path: z.string(),
                        ontologyPurl: z.string().optional(),
                        cedarLink: z.string().optional(),
                        controlledVocabTerms: z.array(z.string()).optional(),
                      })
                      .optional(),
                    cid: z.string(),
                    type: z.enum(['file', 'dir']),
                    contains: z.array(z.any()).optional(),
                    componentStats: z
                      .object({
                        dirs: z.number(),
                        code: z.object({ count: z.number(), size: z.number() }),
                        data: z.object({ count: z.number(), size: z.number() }),
                        pdf: z.object({ count: z.number(), size: z.number() }),
                        unknown: z.object({ count: z.number(), size: z.number() }),
                      })
                      .optional(),
                    path: z.string().optional(),
                    starred: z.boolean().optional(),
                    external: z.boolean().optional(),
                    dataSource: z.enum(['private', 'guest', 'public']).optional(),
                  }),
                )
                .optional()
                .describe(
                  'File tree structure (DriveObject[]) of the published research object. Only included when includeTree=true',
                ),
            }),
          }),
        },
      },
    },
    '403': {
      description: 'Forbidden - User is not authorized to view this submission',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '404': {
      description: 'Submission not found, or published tree not found when includeTree=true',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '500': {
      description: 'Failed to get submission details or retrieve tree data',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Get Revisions
export const getRevisionsOperation: ZodOpenApiOperationObject = {
  operationId: 'getRevisions',
  tags: ['Journals'],
  summary: 'Get all revisions for a submission',
  requestParams: { path: submissionApiSchema.shape.params },
  responses: {
    '200': {
      description: 'Revisions retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
            data: z.array(
              z.object({
                id: z.number(),
                submissionId: z.number(),
                dpid: z.number(),
                version: z.number(),
                status: z.string(),
                createdAt: z.string(),
              }),
            ),
          }),
        },
      },
    },
    '403': {
      description: 'Forbidden - User is not authorized to view revisions',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    '404': {
      description: 'Submission not found',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Get Revision by ID
export const getRevisionByIdOperation: ZodOpenApiOperationObject = {
  operationId: 'getRevisionById',
  tags: ['Journals'],
  summary: 'Get a specific revision by ID',
  requestParams: { path: revisionApiSchema.shape.params },
  responses: {
    '200': {
      description: 'Revision retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
            data: z.object({
              id: z.number(),
              submissionId: z.number(),
              dpid: z.number(),
              version: z.number(),
              status: z.string(),
              createdAt: z.string(),
            }),
          }),
        },
      },
    },
    '403': {
      description: 'Forbidden - User is not authorized to view revision',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    '404': {
      description: 'Revision not found',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Revision Action
export const revisionActionOperation: ZodOpenApiOperationObject = {
  operationId: 'revisionAction',
  tags: ['Journals'],
  summary: 'Accept or reject a revision',
  requestParams: { path: revisionActionSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: revisionActionSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Revision action processed successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
          }),
        },
      },
    },
    '403': {
      description: 'Forbidden - Not a journal editor',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    '404': {
      description: 'Revision not found',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// List Referee Assignments
export const listRefereeAssignmentsOperation: ZodOpenApiOperationObject = {
  operationId: 'listRefereeAssignments',
  tags: ['Journals'],
  summary: 'List referee assignments for the current user in a specific journal',
  responses: {
    '200': {
      description: 'Referee assignments retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            assignments: z.array(
              z.object({
                id: z.number(),
                submissionId: z.number(),
                userId: z.number(),
                assignedById: z.number(),
                assignedAt: z.string(),
                reassignedAt: z.string().nullable(),
                dueDate: z.string().nullable(),
                completedAssignment: z.boolean().nullable(),
                completedAt: z.string().nullable(),
                journalId: z.number(),
                journal: z.object({
                  id: z.number(),
                  name: z.string(),
                  iconCid: z.string().nullable(),
                  description: z.string().nullable(),
                }),
                submission: z.object({
                  id: z.number(),
                  node: z.object({
                    title: z.string(),
                  }),
                }),
              }),
            ),
          }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Show Journal Profile
export const showJournalProfileOperation: ZodOpenApiOperationObject = {
  operationId: 'showJournalProfile',
  tags: ['Journals'],
  summary: 'Get journal profile for the current user',
  responses: {
    '200': {
      description: 'Journal profile retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            profiles: z.array(
              z.object({
                role: z.string(),
                journalId: z.number(),
                journal: z.object({
                  id: z.number(),
                  name: z.string(),
                  description: z.string().nullable(),
                  iconCid: z.string().nullable(),
                }),
              }),
            ),
          }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Invite Referee
export const inviteRefereeOperation: ZodOpenApiOperationObject = {
  operationId: 'inviteReferee',
  tags: ['Journals'],
  summary: 'Invite a referee to review a submission',
  description:
    'Invite a referee (existing user or external email) to review a submission. Supports both internal users (via refereeUserId) and external referees (via refereeEmail). Can specify expected form templates and review deadline.',
  requestParams: { path: inviteRefereeSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: inviteRefereeSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Referee invited successfully',
      content: {
        'application/json': {
          schema: z.object({
            invite: z.object({
              id: z.number(),
              userId: z.number().nullable(),
              submissionId: z.number(),
              relativeDueDateHrs: z.number().nullable(),
              expectedFormTemplateIds: z.array(z.number()),
              email: z.string(),
              token: z.string(),
              invitedById: z.number(),
              createdAt: z.string(),
              expiresAt: z.string(),
              accepted: z.boolean(),
              declined: z.boolean(),
            }),
          }),
        },
      },
    },
    '400': {
      description: 'Bad request - Invalid input parameters',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Not authorized to invite referees for this submission',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '404': {
      description: 'Submission not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Referee Invite Decision
export const refereeInviteDecisionOperation: ZodOpenApiOperationObject = {
  operationId: 'refereeInviteDecision',
  tags: ['Journals'],
  summary: 'Accept or decline a referee invitation',
  description:
    'Process a referee invitation decision. Accepting requires authentication and creates a referee assignment. Declining can be done without authentication.',
  requestParams: { path: refereeInviteDecisionSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: refereeInviteDecisionSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Referee invite decision processed successfully',
      content: {
        'application/json': {
          schema: z.object({
            invite: z.object({
              id: z.number(),
              userId: z.number().nullable(),
              submissionId: z.number(),
              relativeDueDateHrs: z.number().nullable(),
            }),
          }),
        },
      },
    },
    '400': {
      description: 'Invalid or expired invite',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '401': {
      description: 'Authentication required to accept invitation',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '404': {
      description: 'Invite not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '409': {
      description: 'Maximum number of referees already assigned',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Invalidate Referee Assignment
export const invalidateRefereeAssignmentOperation: ZodOpenApiOperationObject = {
  operationId: 'invalidateRefereeAssignment',
  tags: ['Journals'],
  summary: 'Invalidate a referee assignment',
  requestParams: { path: invalidateRefereeAssignmentSchema.shape.params },
  responses: {
    '200': {
      description: 'Referee assignment invalidated successfully',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    '404': {
      description: 'Referee assignment not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Not authorized to invalidate assignment',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Get Referee Invitations
export const getRefereeInvitationsOperation: ZodOpenApiOperationObject = {
  operationId: 'getRefereeInvitations',
  tags: ['Journals'],
  summary: 'Get all referee invitations for the authenticated user',
  description: 'Retrieve all referee invitations for the currently authenticated user, including submission details.',
  responses: {
    '200': {
      description: 'Referee invitations retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              id: z.number(),
              submissionId: z.number(),
              accepted: z.boolean(),
              declined: z.boolean(),
              expiresAt: z.string(),
              token: z.string(),
              submission: z.object({
                journalId: z.number(),
                journal: z.string(),
                title: z.string(),
                id: z.number(),
                author: z.string(),
                dpid: z.number(),
              }),
            }),
          ),
        },
      },
    },
    '500': {
      description: 'Failed to retrieve referee invitations',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Create Form Template
export const createFormTemplateOperation: ZodOpenApiOperationObject = {
  operationId: 'createFormTemplate',
  tags: ['Journals'],
  summary: 'Create a form template',
  description: 'Create a new form template for a journal (Chief Editors only)',
  requestParams: { path: createFormTemplateSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: createFormTemplateSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Template created successfully',
      content: {
        'application/json': {
          schema: z.object({
            template: z.object({
              id: z.number(),
              formUuid: z.string(),
              journalId: z.number(),
              name: z.string(),
              description: z.string().nullable(),
              version: z.number(),
              isActive: z.boolean(),
              structure: z.object({
                formStructureVersion: z.string(),
                sections: z.array(z.any()),
              }),
              createdById: z.number(),
              createdAt: z.string(),
              updatedAt: z.string(),
            }),
          }),
        },
      },
    },
    '400': {
      description: 'Bad request',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Unauthorized - not a chief editor',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '404': {
      description: 'Journal not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// List Form Templates
export const listFormTemplatesOperation: ZodOpenApiOperationObject = {
  operationId: 'listFormTemplates',
  tags: ['Journals'],
  summary: 'List form templates',
  description:
    'Get all form templates for a journal, grouped by form UUID with newest forms first and latest versions first within each form',
  requestParams: {
    path: listFormTemplatesSchema.shape.params,
    query: listFormTemplatesSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Templates retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            templates: z.array(
              z.record(
                z.string(),
                z.array(
                  z.object({
                    id: z.number(),
                    formUuid: z.string(),
                    journalId: z.number(),
                    name: z.string(),
                    description: z.string().nullable(),
                    version: z.number(),
                    isActive: z.boolean(),
                    structure: z.object({
                      formStructureVersion: z.string(),
                      sections: z.array(z.any()),
                    }),
                    createdById: z.number(),
                    createdAt: z.string(),
                    updatedAt: z.string(),
                    createdBy: z.object({
                      id: z.number(),
                      name: z.string().nullable(),
                    }),
                    _count: z.object({
                      responses: z.number(),
                    }),
                  }),
                ),
              ),
            ),
          }),
        },
      },
    },
    '404': {
      description: 'Journal not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Get Form Template
export const getFormTemplateOperation: ZodOpenApiOperationObject = {
  operationId: 'getFormTemplate',
  tags: ['Journals'],
  summary: 'Get a specific form template',
  description:
    'Get details of a specific form template. Accessible by chief editors, associate editors, and referees assigned to the template.',
  requestParams: { path: getFormTemplateSchema.shape.params },
  responses: {
    '200': {
      description: 'Template retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            template: z.object({
              id: z.number(),
              formUuid: z.string(),
              journalId: z.number(),
              name: z.string(),
              description: z.string().nullable(),
              version: z.number(),
              isActive: z.boolean(),
              structure: z.object({
                formStructureVersion: z.string(),
                sections: z.array(z.any()),
              }),
              createdById: z.number(),
              updatedAt: z.string(),
              createdBy: z.object({
                id: z.number(),
                name: z.string().nullable(),
              }),
            }),
          }),
        },
      },
    },
    '403': {
      description: 'Unauthorized - User is not authorized to view this template',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '404': {
      description: 'Template not found or does not belong to the journal',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Update Form Template
export const updateFormTemplateOperation: ZodOpenApiOperationObject = {
  operationId: 'updateFormTemplate',
  tags: ['Journals'],
  summary: 'Update a form template',
  description:
    'Update an existing form template. If the template has been used, creates a new version. (Chief Editors only)',
  requestParams: { path: updateFormTemplateSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: updateFormTemplateSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Template updated successfully',
      content: {
        'application/json': {
          schema: z.object({
            template: z.object({
              id: z.number(),
              formUuid: z.string(),
              journalId: z.number(),
              name: z.string(),
              description: z.string().nullable(),
              version: z.number(),
              isActive: z.boolean(),
              structure: z.object({
                formStructureVersion: z.string(),
                sections: z.array(z.any()),
              }),
              createdById: z.number(),
              createdAt: z.string(),
              updatedAt: z.string(),
            }),
          }),
        },
      },
    },
    '400': {
      description: 'Bad request - Invalid form structure',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Unauthorized - not a chief editor',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '404': {
      description: 'Template not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Get or Create Form Response
export const getFormResponseOperation: ZodOpenApiOperationObject = {
  operationId: 'getFormResponse',
  tags: ['Journals'],
  summary: 'Get or create form response',
  description:
    'Get an existing form response or create a new one. Referees can get or create their form responses. Editors (chief or assigned) can only view existing form responses.',
  requestParams: { path: getFormResponseSchema.shape.params },
  responses: {
    '200': {
      description: 'Form response retrieved or created',
      content: {
        'application/json': {
          schema: z.object({
            id: z.number(),
            templateId: z.number(),
            refereeAssignmentId: z.number(),
            reviewId: z.number().nullable(),
            status: z.enum(['DRAFT', 'SUBMITTED']),
            formData: z.any(),
            startedAt: z.string(),
            submittedAt: z.string().nullable(),
            updatedAt: z.string(),
          }),
        },
      },
    },
    '403': {
      description: 'Unauthorized - User is not the referee or an editor of the journal',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '404': {
      description: 'Assignment, template not found, or form response not found (for editors)',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Save Form Response
export const saveFormResponseOperation: ZodOpenApiOperationObject = {
  operationId: 'saveFormResponse',
  tags: ['Journals'],
  summary: 'Save form response',
  description:
    'Save form response data (auto-save). Each field response must include the fieldType to ensure type safety.',
  requestParams: { path: saveFormResponseSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: saveFormResponseSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Form response saved',
      content: {
        'application/json': {
          schema: z.object({
            response: z.object({
              id: z.number(),
              templateId: z.number(),
              refereeAssignmentId: z.number(),
              reviewId: z.number().nullable(),
              status: z.enum(['DRAFT', 'SUBMITTED']),
              formData: z.any(),
              startedAt: z.string(),
              submittedAt: z.string().nullable(),
              updatedAt: z.string(),
            }),
          }),
        },
      },
    },
    '400': {
      description: 'Cannot modify a submitted form',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Unauthorized to save this form response',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '404': {
      description: 'Form response not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Submit Form Response
export const submitFormResponseOperation: ZodOpenApiOperationObject = {
  operationId: 'submitFormResponse',
  tags: ['Journals'],
  summary: 'Submit form response',
  description:
    'Submit a completed form response. Each field response must include the fieldType to ensure type safety and proper validation.',
  requestParams: { path: submitFormResponseSchema.shape.params },
  requestBody: {
    content: {
      'application/json': {
        schema: submitFormResponseSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Form response submitted',
      content: {
        'application/json': {
          schema: z.object({
            response: z.object({
              id: z.number(),
              templateId: z.number(),
              refereeAssignmentId: z.number(),
              reviewId: z.number(),
              status: z.enum(['DRAFT', 'SUBMITTED']),
              formData: z.any(),
              startedAt: z.string(),
              submittedAt: z.string(),
              updatedAt: z.string(),
            }),
          }),
        },
      },
    },
    '400': {
      description: 'Form validation failed or already submitted',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Unauthorized to submit this form response',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '404': {
      description: 'Form response not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Get Referee Form Status
export const getRefereeFormStatusOperation: ZodOpenApiOperationObject = {
  operationId: 'getRefereeFormStatus',
  tags: ['Journals'],
  summary: 'Get referee form status',
  description:
    'Get the form completion status for a referee assignment. Shows expected templates and completion progress.',
  requestParams: {
    path: z.object({
      journalId: z.coerce.number(),
      assignmentId: z.coerce.number(),
    }),
  },
  responses: {
    '200': {
      description: 'Form status retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            expectedTemplates: z.array(
              z.object({
                id: z.number(),
                name: z.string(),
                description: z.string().nullable(),
                version: z.number(),
              }),
            ),
            completedTemplateIds: z.array(z.number()),
            pendingTemplateIds: z.array(z.number()),
            totalExpected: z.number(),
            totalCompleted: z.number(),
            formResponses: z.array(
              z.object({
                id: z.number(),
                templateId: z.number(),
                status: z.enum(['DRAFT', 'SUBMITTED']),
                startedAt: z.string(),
                submittedAt: z.string().nullable(),
              }),
            ),
          }),
        },
      },
    },
    '403': {
      description: 'Not authorized to view this referee form status',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '404': {
      description: 'Referee assignment not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Show Journal Analytics
export const showJournalAnalyticsOperation: ZodOpenApiOperationObject = {
  operationId: 'showJournalAnalytics',
  tags: ['Journals'],
  summary: 'Get journal analytics dashboard data',
  description:
    'Retrieve comprehensive analytics data for a journal including submission statistics, review metrics, and performance indicators. Includes a 3-second delay for demonstration purposes.',
  requestParams: {
    path: getJournalAnalyticsSchema.shape.params,
    query: getJournalAnalyticsSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Journal analytics retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            overview: z
              .array(
                z.object({
                  value: z.number().describe('Numeric value for the metric'),
                  label: z.string().describe('Human-readable label for the metric'),
                }),
              )
              .describe(
                'Array of overview metrics including total submissions, acceptance rate, average time to acceptance, review completion rate, time to first review, average review time, overdue reviews, and revisions per article',
              ),
            chartData: z
              .array(
                z.object({
                  month: z.string().describe('Month abbreviation (e.g., "Jan", "Feb")'),
                  totalSubmissions: z.number().describe('Number of submissions in that month'),
                }),
              )
              .describe('Monthly submission data for charting, sorted chronologically'),
          }),
        },
      },
    },
    '404': {
      description: 'Journal not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Not authorized to view journal analytics',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// Show Urgent Journal Submissions
export const showUrgentJournalSubmissionsOperation: ZodOpenApiOperationObject = {
  operationId: 'showUrgentJournalSubmissions',
  tags: ['Journals'],
  summary: 'Get urgent journal submissions',
  description:
    'Retrieve submissions that have referee assignments due within the next 7 days, requiring immediate attention. Only returns submissions that are not in ACCEPTED or REJECTED status.',
  requestParams: {
    path: showUrgentSubmissionsSchema.shape.params,
    query: showUrgentSubmissionsSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Urgent submissions retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              id: z.number().describe('Submission ID'),
              dpid: z.number().describe('DPID of the submitted node'),
              version: z.number().describe('Version of the submitted node'),
              status: z
                .enum(['SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'PENDING'])
                .describe('Current submission status'),
              submittedAt: z.string().describe('Date when the submission was made'),
              acceptedAt: z.string().nullable().describe('Date when the submission was accepted (if applicable)'),
              rejectedAt: z.string().nullable().describe('Date when the submission was rejected (if applicable)'),
              title: z.string().describe('Title of the submitted research object'),
              author: z.object({
                name: z.string().describe('Name of the submission author'),
                orcid: z.string().nullable().describe('ORCID of the submission author'),
              }),
              refereeAssignments: z
                .array(
                  z.object({
                    dueDate: z.string().describe('Due date for the referee assignment'),
                  }),
                )
                .describe('Referee assignments for this submission'),
            }),
          ),
        },
      },
    },
    '404': {
      description: 'Journal not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '403': {
      description: 'Not authorized to view urgent submissions',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

export const journalPaths: ZodOpenApiPathsObject = {
  '/v1/journals': {
    get: listJournalsOperation,
    post: createJournalOperation,
  },
  '/v1/journals/profile': {
    get: showJournalProfileOperation,
  },
  '/v1/journals/{journalId}': {
    get: showJournalOperation,
    patch: updateJournalOperation,
  },
  '/v1/journals/{journalId}/invites/editor': {
    post: inviteEditorOperation,
  },
  '/v1/journals/{journalId}/invitation/editor': {
    post: editorInviteDecisionOperation,
  },
  '/v1/journals/{journalId}/editors': {
    get: listJournalEditorsOperation,
  },
  '/v1/journals/{journalId}/editors/{editorUserId}': {
    delete: removeEditorOperation,
  },
  '/v1/journals/{journalId}/editors/{editorUserId}/manage': {
    patch: updateEditorRoleOperation,
  },
  '/v1/journals/{journalId}/editors/{editorUserId}/settings': {
    patch: updateEditorOperation,
  },
  '/v1/journals/{journalId}/submissions': {
    post: createJournalSubmissionOperation,
    get: listJournalSubmissionsOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}': {
    get: getJournalSubmissionOperation,
  },
  '/v1/journals/{journalId}/my-submissions': {
    get: getAuthorJournalSubmissionsOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/assign': {
    post: assignSubmissionToEditorOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/reviews': {
    get: listSubmissionReviewsOperation,
    post: createReviewOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/reviews/{reviewId}': {
    get: getReviewDetailsOperation,
    patch: updateReviewOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/reviews/{reviewId}/submit': {
    post: submitReviewOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/request-revision': {
    post: requestRevisionOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/accept': {
    post: acceptSubmissionOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/reject': {
    post: rejectSubmissionOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/revisions': {
    post: submitRevisionOperation,
    get: getRevisionsOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/revisions/{revisionId}': {
    get: getRevisionByIdOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/revisions/{revisionId}/action': {
    post: revisionActionOperation,
  },
  '/v1/journals/referee/assignments': {
    get: listRefereeAssignmentsOperation,
  },
  '/v1/journals/referee/invitations': {
    get: getRefereeInvitationsOperation,
  },
  '/v1/journals/{journalId}/forms/templates': {
    post: createFormTemplateOperation,
    get: listFormTemplatesOperation,
  },
  '/v1/journals/{journalId}/forms/templates/{templateId}': {
    get: getFormTemplateOperation,
    patch: updateFormTemplateOperation,
  },
  '/v1/journals/{journalId}/forms/response/{assignmentId}/{templateId}': {
    get: getFormResponseOperation,
  },
  '/v1/journals/{journalId}/forms/response/{responseId}': {
    put: saveFormResponseOperation,
  },
  '/v1/journals/{journalId}/forms/response/{responseId}/submit': {
    post: submitFormResponseOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/referee/invite': {
    post: inviteRefereeOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/referee/invite/decision': {
    post: refereeInviteDecisionOperation,
  },
  '/v1/journals/{journalId}/submissions/{submissionId}/referees/{assignmentId}/invalidate': {
    patch: invalidateRefereeAssignmentOperation,
  },
  '/v1/journals/{journalId}/referees/assignments/{assignmentId}/form-status': {
    get: getRefereeFormStatusOperation,
  },
  '/v1/journals/{journalId}/analytics': {
    get: showJournalAnalyticsOperation,
  },
  '/v1/journals/{journalId}/urgentSubmissions': {
    get: showUrgentJournalSubmissionsOperation,
  },
};
