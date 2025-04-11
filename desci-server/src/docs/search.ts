import { z } from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

export const dpidQuerySchema = z.object({
  body: z.object({
    pagination: z
      .object({
        page: z.number().describe('Page number').default(1),
        perPage: z.number().describe('Number of results per page').default(20),
      })
      .optional(),
  }),
});

const nativeWorkSchema = z.object({
  work_id: z.string(),
  title: z.string(),
  dpid: z.string(),
  type: z.string(),
  abstract: z.string(),
  cited_by_count: z.number(),
  publication_year: z.string(),
  publication_date: z.string(),
  is_retracted: z.boolean(),
  is_paratext: z.boolean(),
  language: z.string(),
  content_novelty_percentile: z.number(),
  context_novelty_percentile: z.number(),
  content_novelty_percentile_last_updated: z.number(),
  context_novelty_percentile_last_updated: z.number(),
  best_locations: z.array(
    z.object({
      license: z.string(),
      cited_by_count: z.number(),
      publisher: z.string(),
      pdf_url: z.string(),
      is_oa: z.boolean(),
      source_id: z.string(),
      display_name: z.string(),
      works_count: z.number(),
      version: z.string(),
    }),
  ),
  authors: z.array(
    z.object({
      cited_by_count: z.number(),
      '@timestamp': z.string(),
      last_known_institution: z.string().nullable(),
      works_api_url: z.string(),
      '@version': z.string(),
      orcid: z.string().nullable(),
      updated_date: z.string(),
      id: z.string(),
      display_name: z.string(),
      works_count: z.number(),
      author_id: z.string(),
    }),
  ),
  concepts: z.array(
    z.object({
      concept_id: z.string(),
      display_name: z.string(),
    }),
  ),
  topics: z.array(
    z.object({
      id: z.string(),
      display_name: z.string(),
      subfield_id: z.string(),
      subfield_display_name: z.string(),
      topic_id: z.string(),
    }),
  ),
  '@timestamp': z.string(),
  uuid: z.string(),
  versionIdx: z.number().nullable(),
});

export const dpidQueryOperation: ZodOpenApiOperationObject = {
  operationId: 'dpidQuery',
  summary: 'Search for locally published works',
  description: 'Returns a list of works that have been published locally with DPIDs',
  tags: ['Search'],
  requestBody: {
    content: {
      'application/json': {
        schema: dpidQuerySchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Successful response',
      content: {
        'application/json': {
          schema: z.object({
            finalQuery: z.object({}).passthrough(),
            index: z.string(),
            total: z.number(),
            from: z.number(),
            size: z.number(),
            data: z.array(nativeWorkSchema),
            duration: z.number(),
          }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
            error: z.string(),
          }),
        },
      },
    },
  },
};

export const singleDpidQuerySchema = z.object({
  params: z.object({
    dpid: z.string().describe('The DPID of the work to retrieve'),
  }),
  body: z.object({
    query: z.string().describe('Search query').optional(),
    filters: z.array(z.object({}).passthrough()).describe('Search filters').optional(),
    fuzzy: z.boolean().describe('Enable fuzzy matching').optional(),
    sort: z
      .object({
        field: z.string().default('_score'),
        order: z.enum(['asc', 'desc']).default('desc'),
      })
      .describe('Sort options')
      .optional(),
    pagination: z
      .object({
        page: z.number().describe('Page number').default(1),
        perPage: z.number().describe('Number of results per page').default(20),
      })
      .optional(),
    data: nativeWorkSchema,
  }),
});

export const singleDpidQueryOperation: ZodOpenApiOperationObject = {
  operationId: 'singleDpidQuery',
  summary: 'Get a specific work by DPID',
  description: 'Returns a single work that matches the provided DPID',
  tags: ['Search'],
  requestParams: {
    path: singleDpidQuerySchema.shape.params,
  },
  requestBody: {
    content: {
      'application/json': {
        schema: singleDpidQuerySchema.shape.body,
      },
    },
  },
  responses: {
    '200': {
      description: 'Successful response',
      content: {
        'application/json': {
          schema: z.object({
            finalQuery: z.object({}).passthrough(),
            index: z.string(),
            total: z.number(),
            from: z.number(),
            size: z.number(),
            data: z.array(z.object({}).passthrough()),
            duration: z.number(),
          }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
            error: z.string(),
          }),
        },
      },
    },
  },
};

export const searchPaths: ZodOpenApiPathsObject = {
  '/v1/search/library': {
    post: dpidQueryOperation,
  },
  '/v1/search/library/{dpid}': {
    post: singleDpidQueryOperation,
  },
};
