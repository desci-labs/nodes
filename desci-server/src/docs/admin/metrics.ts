import 'zod-openapi/extend';
import z from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

import { metricsApiSchema } from '../../controllers/admin/schema.js';

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

export const getPublishMetricsOperation: ZodOpenApiOperationObject = {
  operationId: 'getPublishMetrics',
  tags: ['Admin'],
  summary: 'Get publishing metrics',
  description:
    'Retrieves publishing metrics including total users, publishers percentage, community publishers percentage, and guest signup success rate. Optionally includes comparison with previous period.',
  requestParams: {
    query: metricsApiSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            totalUsers: z.number().describe('Total number of users in the period'),
            publishers: z.number().describe('Percentage of users who published (rounded)'),
            publishersInCommunity: z.number().describe('Percentage of users who published in community (rounded)'),
            guestSignUpSuccessRate: z.number().describe('Success rate for guest signups'),
            previousPeriod: z
              .object({
                totalUsers: z.number().describe('Total number of users in the previous period'),
                publishers: z.number().describe('Percentage of users who published in previous period (rounded)'),
                publishersInCommunity: z
                  .number()
                  .describe('Percentage of users who published in community in previous period (rounded)'),
                guestSignUpSuccessRate: z.number().describe('Success rate for guest signups in previous period'),
              })
              .optional()
              .describe('Comparison data with previous period'),
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

export const getFeatureAdoptionMetricsOperation: ZodOpenApiOperationObject = {
  operationId: 'getFeatureAdoptionMetrics',
  tags: ['Admin'],
  summary: 'Get feature adoption metrics',
  description:
    'Retrieves metrics about feature adoption including shares, co-author invites, AI analytics usage, and more',
  requestParams: {
    query: metricsApiSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            totalShares: z.number().describe('Total number of research objects shared'),
            totalCoAuthorInvites: z.number().describe('Total number of co-author invitations sent'),
            totalAIAnalyticsClicks: z.number().describe('Total number of AI analytics tab clicks'),
            totalMatchedArticleClicks: z.number().describe('Total number of matched article clicks in AI analytics'),
            totalClaimedBadges: z.number().describe('Total number of badges claimed'),
            totalProfileViews: z.number().describe('Total number of profile views'),
            totalGuestModeVisits: z.number().describe('Total number of guest mode visits'),
            previousPeriod: z
              .object({
                totalShares: z.number(),
                totalCoAuthorInvites: z.number(),
                totalAIAnalyticsClicks: z.number(),
                totalMatchedArticleClicks: z.number(),
                totalClaimedBadges: z.number(),
                totalProfileViews: z.number(),
                totalGuestModeVisits: z.number(),
              })
              .optional()
              .describe('Comparison data with previous period'),
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

export const getRetentionMetricsOperation: ZodOpenApiOperationObject = {
  operationId: 'getRetentionMetrics',
  tags: ['Admin'],
  summary: 'Get user retention metrics',
  description: 'Retrieves user retention metrics for different time periods (1 day, 7 days, 30 days, and 365 days)',
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            day1Retention: z.number().describe('Percentage of users retained after 1 day'),
            day7Retention: z.number().describe('Percentage of users retained after 7 days'),
            day30Retention: z.number().describe('Percentage of users retained after 30 days'),
            day365Retention: z.number().describe('Percentage of users retained after 365 days'),
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

export const getResearchObjectMetricsOperation: ZodOpenApiOperationObject = {
  operationId: 'getResearchObjectMetrics',
  tags: ['Admin'],
  summary: 'Get research object metrics',
  description:
    'Retrieves metrics about research objects including total created, average per user, and median per user',
  requestParams: {
    query: metricsApiSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            totalRoCreated: z.number().describe('Total number of research objects created'),
            averageRoCreatedPerUser: z.number().describe('Average number of research objects created per user'),
            medianRoCreatedPerUser: z.number().describe('Median number of research objects created per user'),
            previousPeriod: z
              .object({
                totalRoCreated: z.number(),
                averageRoCreatedPerUser: z.number(),
                medianRoCreatedPerUser: z.number(),
              })
              .optional()
              .describe('Comparison data with previous period'),
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
  '/v1/admin/metrics/publish-metrics': {
    get: getPublishMetricsOperation,
  },
  '/v1/admin/metrics/feature-adoption-metrics': {
    get: getFeatureAdoptionMetricsOperation,
  },
  '/v1/admin/metrics/retention-metrics': {
    get: getRetentionMetricsOperation,
  },
  '/v1/admin/metrics/research-object-metrics': {
    get: getResearchObjectMetricsOperation,
  },
};
