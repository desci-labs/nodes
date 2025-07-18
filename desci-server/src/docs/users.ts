import 'zod-openapi/extend';
import { z } from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

import { submitQuestionnaireSchema, updateMarketingConsentSchema } from '../schemas/users.schema.js';

// ---------------------------------------------
//  POST /v1/users/questionnaire
// ---------------------------------------------
export const submitQuestionnaireOperation: ZodOpenApiOperationObject = {
  operationId: 'submitQuestionnaire',
  tags: ['Users'],
  summary: 'Submit user onboarding questionnaire',
  description:
    "Allows an authenticated user to answer the onboarding questionnaire. The only question currently collected is 'How did you hear about us?'.",
  requestBody: {
    description: 'Questionnaire payload',
    required: true,
    content: {
      'application/json': {
        schema: submitQuestionnaireSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Questionnaire submitted successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(true),
            data: z.object({ submitted: z.boolean() }),
            message: z.string().optional(),
          }),
        },
      },
    },
    '400': {
      description: 'Validation error – invalid request body',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(false),
            message: z.string(),
            errors: z.any().optional(),
          }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(false),
            message: z.string(),
          }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// ---------------------------------------------
//  PATCH /v1/auth/marketing-consent
// ---------------------------------------------
export const updateMarketingConsentOperation: ZodOpenApiOperationObject = {
  operationId: 'updateMarketingConsent',
  tags: ['Users'],
  summary: 'Update marketing email consent preference',
  description:
    'Allows an authenticated user to opt in or opt out of receiving marketing emails. This action is logged for analytics and audit purposes.',
  requestBody: {
    description: 'Marketing consent preference',
    required: true,
    content: {
      'application/json': {
        schema: updateMarketingConsentSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Marketing consent preference updated successfully',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(true),
            data: z.object({
              receiveMarketingEmails: z.boolean().describe('Updated marketing email consent preference'),
            }),
            message: z.string().optional(),
          }),
        },
      },
    },
    '400': {
      description: 'Validation error – invalid request body',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(false),
            message: z.string(),
            errors: z.any().optional(),
          }),
        },
      },
    },
    '404': {
      description: 'User not found',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(false),
            message: z.string(),
          }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(false),
            message: z.string(),
          }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

export const userPaths: ZodOpenApiPathsObject = {
  '/v1/users/questionnaire': {
    post: submitQuestionnaireOperation,
  },
  '/v1/auth/marketing-consent': {
    patch: updateMarketingConsentOperation,
  },
};
