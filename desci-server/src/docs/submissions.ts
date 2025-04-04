import { z } from 'zod';
import { ZodOpenApiOperationObject } from 'zod-openapi';

import {
  createSubmissionSchema,
  getCommunitySubmissionsSchema,
  getSubmissionSchema,
  getUserSubmissionsSchema,
  rejectSubmissionSchema,
  updateSubmissionStatusSchema,
} from '../routes/v1/communities/submissions-schema.js';

// Operation objects for each route handler
export const createSubmissionOperation: ZodOpenApiOperationObject = {
  operationId: 'createSubmission',
  tags: ['Submission'],
  summary: 'Create a new submission to a community',
  requestBody: {
    content: {
      'application/json': { schema: createSubmissionSchema.shape.body },
    },
  },
  responses: {
    '201': {
      description: 'Submission created successfully',
      content: {
        'application/json': {
          schema: z.object({
            id: z.number(),
            nodeId: z.string(),
            communityId: z.number(),
            userId: z.number(),
            status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
            createdAt: z.date(),
            updatedAt: z.date(),
          }),
        },
      },
    },
    '400': {
      description: 'Bad request - Community or Node not found',
    },
  },
};

export const updateSubmissionStatusOperation: ZodOpenApiOperationObject = {
  tags: ['Submission'],
  operationId: 'updateSubmissionStatus',
  summary: 'Update the status of a submission',
  requestParams: { query: rejectSubmissionSchema.shape.params },
  requestBody: {
    content: {
      'application/json': { schema: rejectSubmissionSchema.shape.body },
    },
  },
  responses: {
    '200': {
      description: 'Submission status updated successfully',
      content: {
        'application/json': {
          schema: z.object({
            id: z.number(),
            status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
            reason: z.string().optional(),
            node: z.object({}).passthrough(), // Node details schema
          }),
        },
      },
    },
    '400': {
      description: 'Bad request - Submission not found',
    },
    '403': {
      description: 'Forbidden - User is not a community member',
    },
  },
};

export const getSubmissionOperation: ZodOpenApiOperationObject = {
  operationId: 'getSubmission',
  tags: ['Submission'],
  summary: 'Get details of a specific submission',
  requestParams: { path: getSubmissionSchema.shape.params },
  responses: {
    '200': {
      description: 'Submission details retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            id: z.number(),
            nodeId: z.string(),
            communityId: z.number(),
            status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
            reason: z.string().optional(),
            node: z.object({}).passthrough(), // Node details schema
          }),
        },
      },
    },
    '400': {
      description: 'Bad request - Submission not found',
    },
    '403': {
      description: 'Forbidden - User not authorized to view submission',
    },
  },
};

export const cancelUserSubmissionOperation: ZodOpenApiOperationObject = {
  operationId: 'cancelUserSubmission',
  tags: ['Submission'],
  summary: 'Cancel a pending submission',
  requestParams: { path: getSubmissionSchema }, // Reusing schema since it has the same structure
  responses: {
    '200': {
      description: 'Submission cancelled successfully',
    },
    '403': {
      description: 'Forbidden - Can only cancel pending submissions',
    },
  },
};

export const getUserSubmissionsOperation: ZodOpenApiOperationObject = {
  operationId: 'getUserSubmissions',
  tags: ['Users'],
  summary: 'Get all submissions for a specific user',
  requestParams: {
    path: getUserSubmissionsSchema.shape.params,
    query: getUserSubmissionsSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'User submissions retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              id: z.number(),
              nodeId: z.string(),
              communityId: z.number(),
              userId: z.number(),
              status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
              reason: z.string().optional(),
              createdAt: z.date(),
              updatedAt: z.date(),
              node: z.object({}).passthrough(), // Node details schema
            }),
          ),
        },
      },
    },
    '403': {
      description: 'Forbidden - Users can only view their own submissions',
    },
  },
};

export const getCommunitySubmissionsOperation: ZodOpenApiOperationObject = {
  operationId: 'getCommunitySubmissions',
  tags: ['Communities'],
  summary: 'Get all submissions for a specific community',
  requestParams: {
    path: getCommunitySubmissionsSchema.shape.params,
  },
  responses: {
    '200': {
      description: 'Community submissions retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              id: z.number(),
              nodeId: z.string(),
              communityId: z.number(),
              userId: z.number(),
              status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
              reason: z.string().optional(),
              createdAt: z.date(),
              updatedAt: z.date(),
              node: z.object({}).passthrough(), // Node details schema
            }),
          ),
        },
      },
    },
  },
};
