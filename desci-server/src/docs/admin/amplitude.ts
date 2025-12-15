import 'zod-openapi/extend';
import z from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

import { updateAmplitudeIdentitySchema } from '../../controllers/admin/amplitude.js';

export const updateAmplitudeIdentityOperation: ZodOpenApiOperationObject = {
  operationId: 'updateAmplitudeIdentity',
  tags: ['Admin'],
  summary: 'Update user identity/properties on Amplitude (Sciweave)',
  description: `
Updates user properties on Amplitude (Sciweave) using the Identify API without triggering an event.
This is useful for syncing user data, correcting user properties, or setting user attributes
that should appear in Amplitude analytics.

Note: Updates are not retroactive and only apply to future events.
Rate limit: 1800 updates per user per hour.

See: https://amplitude.com/docs/apis/analytics/identify
  `,
  requestParams: {
    path: updateAmplitudeIdentitySchema.shape.params,
  },
  requestBody: {
    content: {
      'application/json': {
        schema: updateAmplitudeIdentitySchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Successfully updated user properties on Amplitude',
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              message: z.string(),
              userId: z.string(),
              properties: z.record(z.string(), z.unknown()),
              currentProperties: z.record(z.string(), z.unknown()).nullable().openapi({
                description:
                  'Current user properties from Amplitude (null if AMPLITUDE_SECRET_KEY_SCIWEAVE is not set or user not found)',
              }),
            }),
          }),
        },
      },
    },
    '400': {
      description: 'Bad request - invalid input or Amplitude API error',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    '401': {
      description: 'Unauthorized - user not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    '403': {
      description: 'Forbidden - user is not an admin',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

export const amplitudePaths: ZodOpenApiPathsObject = {
  '/v1/admin/users/{userId}/amplitude/identify': {
    post: updateAmplitudeIdentityOperation,
  },
};
