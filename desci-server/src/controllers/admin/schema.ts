import 'zod-openapi/extend';
import zod, { z } from 'zod';

export const analyticsChartSchema = zod.object({
  query: zod.object({
    from: zod.string().openapi({ description: 'start date', example: '2025-03-03' }),
    to: zod.string().openapi({ description: 'end date', example: '2025-03-17' }),
    interval: zod
      .union([zod.literal('daily'), zod.literal('weekly'), zod.literal('monthly'), zod.literal('yearly')])
      .optional()
      .default('daily')
      .describe('Time aggregates for which the returned data should be grouped together')
      .openapi({ description: 'Time aggregates for which the returned data should be grouped together' }),
  }),
});

export const metricsApiSchema = zod.object({
  query: zod.object({
    from: zod
      .string()
      .datetime()
      .optional()
      .openapi({ description: 'start date', example: '2025-06-01T00:00:00.000Z' }),
    to: zod.string().datetime().optional().openapi({ description: 'end date', example: '2025-06-12T23:59:00.000Z' }),
    compareToPreviousPeriod: zod.coerce.boolean().optional().default(false).describe('Compare to previous period'),
  }),
});

export const sciweaveUsersExportSchema = zod.object({
  query: zod.object({
    from: zod
      .string()
      .datetime()
      .optional()
      .openapi({ description: 'Start date for filtering users by dateJoined (ISO datetime)', example: '2025-01-01T00:00:00.000Z' }),
    to: zod
      .string()
      .datetime()
      .optional()
      .openapi({ description: 'End date for filtering users by dateJoined (ISO datetime)', example: '2025-12-31T23:59:59.999Z' }),
  }),
});
