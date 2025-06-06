import 'zod-openapi/extend';
import z from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

export const getUserEngagementMetricsOperation: ZodOpenApiOperationObject = {
  operationId: 'getUserEngagementMetrics',
  tags: ['Admin'],
  summary: 'Get user engagement metrics',
  description:
    'Retrieves various user engagement metrics including active users, publishing metrics, and exploring users',
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            activeUsers: z.object({
              daily: z.number().describe('Number of active users in the last 24 hours'),
              weekly: z.number().describe('Number of active users in the last 7 days'),
              monthly: z.number().describe('Number of active users in the last 30 days'),
            }),
            publishingUsers: z.object({
              researchObjectsCreated: z.number().describe('Total number of research objects created'),
              researchObjectsUpdated: z.number().describe('Total number of research objects updated'),
              researchObjectsShared: z.number().describe('Total number of research objects shared'),
              researchObjectsPublished: z.number().describe('Total number of published research objects'),
              communityPublications: z.number().describe('Total number of community publications'),
            }),
            exploringUsers: z.object({
              daily: z.number().describe('Number of exploring users in the last 24 hours'),
              weekly: z.number().describe('Number of exploring users in the last 7 days'),
              monthly: z.number().describe('Number of exploring users in the last 30 days'),
            }),
          }),
        },
      },
    },
    '401': {
      description: 'Unauthorized - User not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    '403': {
      description: 'Forbidden - User is not an admin',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

export const metricsPaths: ZodOpenApiPathsObject = {
  '/v1/admin/metrics/user-engagements': {
    get: getUserEngagementMetricsOperation,
  },
};
