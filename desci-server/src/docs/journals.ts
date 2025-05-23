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
} from '../schemas/journals.schema.js';

// List Journals
export const listJournalsOperation: ZodOpenApiOperationObject = {
  operationId: 'listJournals',
  tags: ['Journals'],
  summary: 'List all journals',
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
};
