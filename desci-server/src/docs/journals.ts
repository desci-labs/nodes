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
};
