import { z } from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

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
  createFormTemplateSchema,
  listFormTemplatesSchema,
  getFormTemplateSchema,
  getFormResponseSchema,
  saveFormResponseSchema,
  submitFormResponseSchema,
  inviteRefereeSchema,
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
            submissions: z.array(
              z.object({
                journal: z.object({
                  id: z.number(),
                  name: z.string(),
                }),
                dpid: z.number(),
                version: z.number(),
                status: z.string(),
                id: z.number(),
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
        schema: z.object({
          editorFeedback: z.string().optional(),
          authorFeedback: z.string().optional(),
          recommendation: z.enum(['ACCEPT', 'MINOR_REVISION', 'MAJOR_REVISION', 'REJECT']).optional(),
          review: z.array(
            z.object({
              question: z.string(),
              answer: z.string(),
            }),
          ),
        }),
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
        schema: z.object({
          editorFeedback: z.string().optional(),
          authorFeedback: z.string().optional(),
          recommendation: z.enum(['ACCEPT', 'MINOR_REVISION', 'MAJOR_REVISION', 'REJECT']).optional(),
          review: z
            .array(
              z.object({
                question: z.string(),
                answer: z.string(),
              }),
            )
            .optional(),
        }),
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
        schema: z.object({
          editorFeedback: z.string(),
          recommendation: z.enum(['ACCEPT', 'MINOR_REVISION', 'MAJOR_REVISION', 'REJECT']),
          review: z.array(
            z.object({
              question: z.string(),
              answer: z.string(),
            }),
          ),
        }),
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

// Invite Referee
export const inviteRefereeOperation: ZodOpenApiOperationObject = {
  operationId: 'inviteReferee',
  tags: ['Journals'],
  summary: 'Invite a referee',
  description: 'Invite a referee to review a submission. Can specify expected form templates.',
  requestParams: {
    path: z.object({
      journalId: z.coerce.number(),
      submissionId: z.coerce.number(),
    }),
  },
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
    '400': {
      description: 'Invalid form template IDs or other validation error',
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

export const journalPaths: ZodOpenApiPathsObject = {
  '/v1/journals': {
    get: listJournalsOperation,
    post: createJournalOperation,
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
  '/v1/journals/{journalId}/editors/{editorId}': {
    patch: updateEditorRoleOperation,
    delete: removeEditorOperation,
  },
  '/v1/journals/{journalId}/submissions': {
    post: createJournalSubmissionOperation,
    get: listJournalSubmissionsOperation,
  },
  '/v1/journals/{journalId}/submissions/author': {
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
  '/v1/journals/{journalId}/forms/templates': {
    post: createFormTemplateOperation,
    get: listFormTemplatesOperation,
  },
  '/v1/journals/{journalId}/forms/templates/{templateId}': {
    get: getFormTemplateOperation,
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
  '/v1/journals/{journalId}/referees/assignments/{assignmentId}/form-status': {
    get: getRefereeFormStatusOperation,
  },
};
