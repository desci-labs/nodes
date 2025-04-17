import 'zod-openapi/extend';
import z from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

export const checkMintabilityOperation: ZodOpenApiOperationObject = {
  operationId: 'checkMintability',
  tags: ['DOI'],
  summary: 'Check if a node is mintable for DOI',
  requestParams: {
    query: z.object({
      uuid: z.string().describe('UUID of node to check'),
    }),
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.null(),
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

export const retrieveDoiOperation: ZodOpenApiOperationObject = {
  operationId: 'retrieveDoi',
  tags: ['DOI'],
  summary: 'Retrieve DOI information',
  requestParams: {
    query: z.object({
      doi: z.string().describe('DOI to retrieve information for'),
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
              authors_orcid: z.array(z.string().nullable()),
              authors: z.array(
                z.object({
                  name: z.string(),
                  orcid: z.string().nullable(),
                }),
              ),
              abstract: z.string(),
              doi: z.string(),
              content_novelty_percentile: z.number(),
              context_novelty_percentile: z.number(),
            }),
          }),
        },
      },
    },
    '404': {
      description: 'DOI not found',
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

export const doiPaths: ZodOpenApiPathsObject = {
  '/v1/doi/check/{uuid}': {
    get: checkMintabilityOperation,
  },
  '/v1/doi': {
    get: retrieveDoiOperation,
  },
};
