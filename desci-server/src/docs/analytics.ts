import 'zod-openapi/extend';
import z from 'zod';
import { ZodOpenApiOperationObject } from 'zod-openapi';

import { userAnalyticsSchema } from '../controllers/admin/analytics.js';
import { analyticsChartSchema } from '../controllers/admin/schema.js';

export const getAnalyticsOperation: ZodOpenApiOperationObject = {
  operationId: 'getAnalytics',
  summary: 'Get Analytics',
  tags: ['Admin'],
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            newUsers: z.number(),
            newOrcidUsers: z.number(),
            activeUsers: z.number(),
            activeOrcidUsers: z.number(),
            newNodes: z.number(),
            nodeViews: z.number(),
            bytes: z.number(),
            publishedNodes: z.number(),
            downloadedBytes: z.number(),
          }),
        },
      },
    },
  },
};

export const getAggregatedAnalyticsOperation: ZodOpenApiOperationObject = {
  operationId: 'getAggregatedAnalytics',
  tags: ['Admin'],
  summary: 'Get Aggregated Analytics',
  requestParams: {
    query: analyticsChartSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            analytics: z.array(
              z.object({
                date: z.date(),
                newUsers: z.number(),
                newOrcidUsers: z.number(),
                newSciweaveUsers: z.number(),
                activeUsers: z.number(),
                activeOrcidUsers: z.number(),
                nodeViews: z.number(),
                newNodes: z.number(),
                publishedNodes: z.number(),
                bytes: z.number(),
                downloadedBytes: z.number(),
              }),
            ),
            meta: z.object({
              selectedDatesInterval: z.object({
                start: z.date(),
                end: z.date(),
              }),
              diffInDays: z.number(),
              startDate: z.date(),
              endDate: z.date(),
            }),
          }),
        },
      },
    },
  },
};

export const getAggregatedAnalyticsCsvOperation: ZodOpenApiOperationObject = {
  operationId: 'getAggregatedAnalyticsCsv',
  tags: ['Admin'],
  summary: 'Get Aggregated Analytics as CSV',
  requestParams: {
    query: analyticsChartSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'text/csv': {
          schema: z.string(),
        },
      },
    },
  },
};

export const getActiveOrcidUserAnalyticsOperation: ZodOpenApiOperationObject = {
  operationId: 'getActiveOrcidUserAnalytics',
  tags: ['Admin'],
  summary: 'Get Active ORCID User Analytics',
  requestParams: {
    query: z.object({
      unit: z.literal('days'),
      value: z.string(),
    }),
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              email: z.string(),
              orcid: z.string().optional(),
              publications: z.number().optional(),
              dateJoined: z.string().optional(),
            }),
          ),
        },
      },
    },
  },
};

export const getNewUserAnalyticsOperation: ZodOpenApiOperationObject = {
  operationId: 'getNewUserAnalytics',
  tags: ['Admin'],
  summary: 'Get New User Analytics',
  requestParams: {
    query: userAnalyticsSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              email: z.string(),
              orcid: z.string().optional(),
              publications: z.number(),
              dateJoined: z.union([z.string(), z.number()]),
            }),
          ),
        },
        'text/csv': {
          schema: z.string(),
        },
      },
    },
  },
};

export const getNewOrcidUserAnalyticsOperation: ZodOpenApiOperationObject = {
  operationId: 'getNewOrcidUserAnalytics',
  tags: ['Admin'],
  summary: 'Get New ORCID User Analytics',
  requestParams: {
    query: userAnalyticsSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              email: z.string(),
              orcid: z.string().optional(),
              publications: z.number(),
              dateJoined: z.union([z.string(), z.number()]),
            }),
          ),
        },
      },
    },
  },
};

export const getNewSciweaveUserAnalyticsOperation: ZodOpenApiOperationObject = {
  operationId: 'getNewSciweaveUserAnalytics',
  tags: ['Admin'],
  summary: 'Get New Sciweave User Analytics',
  description:
    'Retrieve aggregated analytics data for new Sciweave users (users with USER_SIGNUP_SUCCESS and isSciweave=true in their interaction logs) within a specified time period, grouped by time intervals (daily, weekly, monthly, yearly).',
  requestParams: {
    query: analyticsChartSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            analytics: z.array(
              z.object({
                date: z.string(),
                newSciweaveUsers: z.number(),
              }),
            ),
            meta: z.object({
              from: z.string(),
              to: z.string(),
              diffInDays: z.number(),
            }),
          }),
        },
      },
    },
  },
};
