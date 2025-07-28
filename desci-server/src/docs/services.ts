import { z } from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

export const generateShareImageQuerySchema = z.object({
  query: z.object({
    text: z.string().describe('The search question text to display on the image').optional(),
    id: z
      .string()
      .describe('ID of a stored search result to generate image from (alternative to other parameters)')
      .optional(),
    answer: z.string().describe('The answer text to preview on the image').optional(),
    refs: z.string().describe('Number of references/citations').optional(),
    citations: z.string().describe('JSON string containing citation data').optional(),
  }),
});

export const generateShareImageOperation: ZodOpenApiOperationObject = {
  operationId: 'generateShareImage',
  summary: 'Generate a social media share image for search results',
  description:
    'Generates a PNG image suitable for social media sharing that displays a search question, answer preview, and citations. The image can be generated from either direct parameters or by referencing a stored search result by ID.',
  tags: ['Services'],
  requestParams: {
    query: generateShareImageQuerySchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successfully generated share image',
      content: {
        'image/png': {
          schema: z.string().describe('Binary PNG image data'),
        },
      },
      headers: {
        'Cache-Control': {
          description: 'Cache control header',
          schema: z.string().describe('Cache control directives, e.g., "public, max-age=21600"'),
        },
        'Content-Type': {
          description: 'Content type header',
          schema: z.string().describe('MIME type, e.g., "image/png"'),
        },
      },
    },
    '400': {
      description: 'Bad request - missing required parameters',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string().describe('Error message describing what parameter is missing or invalid'),
          }),
        },
      },
    },
    '404': {
      description: 'Search result not found (when using id parameter)',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string().describe('Error message indicating the search result was not found'),
          }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string().describe('General error message'),
            details: z.string().describe('Detailed error information'),
          }),
        },
      },
    },
  },
};

export const servicesPaths: ZodOpenApiPathsObject = {
  '/v1/services/generate-share-image': {
    get: generateShareImageOperation,
  },
};
