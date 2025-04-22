import 'zod-openapi/extend';
import z from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

export const getOpenAlexWorkOperation: ZodOpenApiOperationObject = {
  operationId: 'getOpenAlexWork',
  tags: ['OpenAlex'],
  summary: 'Retrieve metadata for an OpenAlex work',
  requestParams: {
    path: z.object({
      workId: z.string().describe('OpenAlex work ID to retrieve information for'),
    }),
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              pdf_url: z.string(),
              landing_page_url: z.string(),
              title: z.string(),
              works_id: z.string(),
              work_type: z.string(),
              publication_year: z.number(),
              citation_count: z.number(),
              oa_status: z.string(),
              publisher: z.string(),
              source_name: z.string(),
              authors: z.array(
                z.object({
                  name: z.string(),
                  orcid: z.string().nullable(),
                  id: z.string().nullable(),
                }),
              ),
              abstract: z.string(),
              doi: z.string(),
              content_novelty_percentile: z.number().optional(),
              context_novelty_percentile: z.number().optional(),
            }),
          }),
        },
      },
    },
    '400': {
      description: 'Invalid request parameters',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
            details: z.union([z.array(z.any()), z.string()]).optional(),
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
};

export const openAlexPaths: ZodOpenApiPathsObject = {
  '/v1/openalex/work/{workId}': {
    get: getOpenAlexWorkOperation,
  },
};
