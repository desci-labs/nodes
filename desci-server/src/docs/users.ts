import 'zod-openapi/extend';
import { z } from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

import {
  exportMarketingConsentSchema,
  submitQuestionnaireSchema,
  updateMarketingConsentSchema,
} from '../schemas/users.schema.js';

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

// ---------------------------------------------
//  GET /v1/admin/users/export-marketing-consent
// ---------------------------------------------
export const getMarketingConsentUsersCsvOperation: ZodOpenApiOperationObject = {
  operationId: 'getMarketingConsentUsersCsv',
  tags: ['Admin'],
  summary: 'Export marketing consent users as CSV or Excel',
  description:
    'Exports a file containing email addresses of all users who have opted-in to receive marketing emails. Supports CSV (default) and Excel formats. This endpoint is restricted to admin users only and includes input validation for the format parameter.',
  requestParams: { query: exportMarketingConsentSchema.shape.query },
  responses: {
    '200': {
      description: 'File containing marketing consent user emails',
      content: {
        'text/csv': {
          schema: z.string().openapi({ format: 'binary' }).describe('CSV file with email addresses'),
        },
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
          schema: z.string().openapi({ format: 'binary' }).describe('Excel file with email addresses'),
        },
      },
      headers: {
        'Content-Disposition': {
          description: 'File attachment header',
          schema: { type: 'string', example: 'attachment; filename=marketing-consent-emails.csv or .xlsx' },
        },
        'Content-Type': {
          description: 'File content type',
          schema: {
            type: 'string',
            example: 'text/csv or application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        },
      },
    },
    '400': {
      description: 'Bad Request - Invalid format parameter',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(false),
            message: z.string(),
            details: z.array(
              z.object({
                field: z.string(),
                message: z.string(),
              }),
            ),
          }),
        },
      },
    },
    '401': {
      description: 'Unauthorized - user not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(false),
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
            error: z.string(),
          }),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

// ---------------------------------------------
//  POST /v1/users/me/account-deletion-request
// ---------------------------------------------
export const requestAccountDeletionOperation: ZodOpenApiOperationObject = {
  operationId: 'requestAccountDeletion',
  tags: ['Users'],
  summary: 'Request account deletion (Sciweave only)',
  description:
    'Schedules the authenticated user’s account for hard deletion in 30 days. Only available for users who signed up from Sciweave (web or mobile). Optional reason is stored for audit.',
  requestBody: {
    description: 'Optional reason for deletion',
    required: false,
    content: {
      'application/json': {
        schema: z.object({
          reason: z.string().optional().describe('User-provided reason for requesting account deletion'),
        }),
      },
    },
  },
  responses: {
    '200': {
      description: 'Deletion scheduled',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(true),
            scheduledDeletionAt: z.string().describe('ISO date when the account will be hard-deleted'),
          }),
        },
      },
    },
    '403': {
      description: 'Forbidden - account deletion is only for Sciweave accounts',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(false),
            message: z.string(),
          }),
        },
      },
    },
    '409': {
      description: 'Conflict - deletion already scheduled',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(false),
            message: z.string(),
            scheduledDeletionAt: z.string().optional(),
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
//  POST /v1/users/me/account-deletion-cancel
// ---------------------------------------------
export const cancelAccountDeletionOperation: ZodOpenApiOperationObject = {
  operationId: 'cancelAccountDeletion',
  tags: ['Users'],
  summary: 'Cancel scheduled account deletion',
  description:
    'Removes the scheduled account deletion for the authenticated user and sends a magic code email so they can log in again. Note: When requesting a magic code (POST /v1/auth/magic with email only, no code), if the account is scheduled for deletion the response includes accountDisabled: true and scheduledDeletionAt; no magic code email is sent.',
  responses: {
    '200': {
      description: 'Deletion cancelled or no deletion was scheduled',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(true),
            message: z.string().optional().describe('Present when no deletion was scheduled'),
            cancelled: z.boolean().optional().describe('True when a scheduled deletion was removed'),
            magicCodeSent: z.boolean().optional().describe('True when a login magic code was sent to the user email'),
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
  '/v1/users/me/account-deletion-request': {
    post: requestAccountDeletionOperation,
  },
  '/v1/users/me/account-deletion-cancel': {
    post: cancelAccountDeletionOperation,
  },
  '/v1/auth/marketing-consent': {
    patch: updateMarketingConsentOperation,
  },
  '/v1/admin/users/export-marketing-consent': {
    get: getMarketingConsentUsersCsvOperation,
  },
};
