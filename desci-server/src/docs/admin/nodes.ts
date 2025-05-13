import 'zod-openapi/extend';
import z from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

import { externalPublicationsSchema } from '../../controllers/nodes/externalPublications.js';

export const getExternalPublicationsOperation: ZodOpenApiOperationObject = {
  operationId: 'getExternalPublications',
  tags: ['Admin'],
  summary: 'Get external publications for a node',
  requestParams: {
    path: externalPublicationsSchema.shape.params,
  },
  responses: {
    '200': {
      description: 'Successfully retrieved external publications',
      content: {
        'application/json': {
          schema: z.object({
            publications: z.array(
              z.object({
                id: z.number(),
                uuid: z.string(),
                score: z.number(),
                doi: z.string(),
                publisher: z.string(),
                publishYear: z.string(),
                sourceUrl: z.string(),
                isVerified: z.boolean(),
                verifiedAt: z.string().nullable(),
                createdAt: z.string(),
                updatedAt: z.string(),
              }),
            ),
          }),
        },
      },
    },
    '400': {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    '404': {
      description: 'Node not found',
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

export const clearExternalPubCacheOperation: ZodOpenApiOperationObject = {
  operationId: 'clearExternalPubCache',
  tags: ['Admin'],
  summary: 'Clear the external publications cache for a node',
  requestParams: {
    path: externalPublicationsSchema.shape.params,
  },
  responses: {
    '200': {
      description: 'Successfully cleared external publications cache',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
          }),
        },
      },
    },
    '400': {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    '404': {
      description: 'Node not found',
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

export const automateManuscriptOperation: ZodOpenApiOperationObject = {
  operationId: 'automateManuscript',
  tags: ['Admin'],
  summary: 'Automatically extract and attach DOI metadata to a manuscript component',
  requestParams: {
    path: z.object({
      uuid: z.string().describe('UUID of the node containing the manuscript'),
    }),
  },
  requestBody: {
    content: {
      'application/json': {
        schema: z.object({
          path: z
            .string()
            .startsWith('root/', 'Invalid component path')
            .describe('Path to the PDF component in the node'),
          prepublication: z.boolean().optional().describe('Whether this is a prepublication flow'),
        }),
      },
    },
  },
  responses: {
    '200': {
      description: 'Successfully extracted and attached DOI metadata',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
          }),
        },
      },
    },
    '400': {
      description: 'Invalid request or component not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    '404': {
      description: 'DOI not found for the manuscript',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    '422': {
      description: 'Unable to extract metadata from manuscript',
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

export const adminNodesPaths: ZodOpenApiPathsObject = {
  '/v1/admin/nodes/{uuid}/external-publications': {
    get: getExternalPublicationsOperation,
  },
  '/v1/admin/nodes/{uuid}/clear-external-publications': {
    post: clearExternalPubCacheOperation,
  },
  '/v1/admin/nodes/{uuid}/automate-manuscript': {
    post: automateManuscriptOperation,
  },
};
