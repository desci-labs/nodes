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
