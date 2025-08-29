import 'zod-openapi/extend';
import { z } from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

import { googleAuthSchema } from '../schemas/auth.schema.js';

// ---------------------------------------------
//  POST /v1/auth/google/login
// ---------------------------------------------
export const googleLoginOperation: ZodOpenApiOperationObject = {
  operationId: 'googleLogin',
  tags: ['Authentication'],
  summary: 'Authenticate user with Google OAuth',
  description:
    'Authenticates a user using Google OAuth ID token. Creates a new user if one does not exist with the provided email. Supports both PUBLISH and SCIWEAVE app authentication.',
  requestBody: {
    description: 'Google OAuth authentication payload',
    required: true,
    content: {
      'application/json': {
        schema: googleAuthSchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Authentication successful',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(true),
            user: z.object({
              email: z.string().email().describe('User email address'),
              token: z.string().describe('JWT access token'),
              termsAccepted: z.boolean().describe('Whether user has accepted terms of service'),
              isNewUser: z.boolean().optional().describe('Present only for newly created users'),
            }),
          }),
        },
      },
      headers: {
        'Set-Cookie': {
          description: 'Authentication cookie',
          schema: { type: 'string', example: 'authToken=<jwt_token>; Path=/; HttpOnly' },
        },
      },
    },
    '400': {
      description: 'Bad request - missing or invalid parameters',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(false),
            message: z.string(),
            errors: z
              .array(
                z.object({
                  field: z.string(),
                  message: z.string(),
                }),
              )
              .optional(),
          }),
        },
      },
    },
    '401': {
      description: 'Authentication failed - invalid Google token',
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
};

export const authPaths: ZodOpenApiPathsObject = {
  '/v1/auth/google/login': {
    post: googleLoginOperation,
  },
};
