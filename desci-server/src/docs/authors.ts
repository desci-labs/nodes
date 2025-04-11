import { z } from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

import { getAuthorNodesSchema, getAuthorSchema, getAuthorWorksSchema } from '../controllers/authors/index.js';
export const getAuthorProfileOperation: ZodOpenApiOperationObject = {
  operationId: 'getAuthorProfile',
  tags: ['Authors'],
  summary: 'Get author profile by ORCID or Openalex ID',
  requestParams: {
    path: getAuthorSchema.shape.params,
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              id: z.string(),
              orcid: z.string().optional(),
              display_name: z.string(),
              display_name_alternatives: z.array(z.string()).optional(),
              works_count: z.number().optional(),
              cited_by_count: z.number().optional(),
              summary_stats: z
                .object({
                  h_index: z.number(),
                  i10_index: z.number(),
                  '2yr_mean_citedness': z.number(),
                })
                .optional(),
              ids: z
                .object({
                  openalex: z.string().optional(),
                  orcid: z.string().optional(),
                })
                .optional(),
              affiliations: z
                .array(
                  z.object({
                    institution: z.object({
                      id: z.string(),
                      ror: z.string().optional(),
                      display_name: z.string(),
                      country_code: z.string().optional(),
                      type: z.string().optional(),
                      lineage: z.array(z.string()).optional(),
                    }),
                    years: z.array(z.number()).optional(),
                  }),
                )
                .optional(),
              last_known_institutions: z
                .array(
                  z.object({
                    id: z.string(),
                    ror: z.string().optional(),
                    display_name: z.string(),
                    country_code: z.string().optional(),
                    type: z.string().optional(),
                    lineage: z.array(z.string()).optional(),
                  }),
                )
                .optional(),
              topics: z
                .array(
                  z.object({
                    id: z.string(),
                    display_name: z.string(),
                    count: z.number().optional(),
                    subfield: z
                      .object({
                        id: z.string(),
                        display_name: z.string(),
                      })
                      .optional(),
                    field: z
                      .object({
                        id: z.string(),
                        display_name: z.string(),
                      })
                      .optional(),
                    domain: z
                      .object({
                        id: z.string(),
                        display_name: z.string(),
                      })
                      .optional(),
                  }),
                )
                .optional(),
              topic_share: z
                .array(
                  z.object({
                    id: z.string(),
                    display_name: z.string(),
                    value: z.number(),
                    subfield: z
                      .object({
                        id: z.string(),
                        display_name: z.string(),
                      })
                      .optional(),
                    field: z
                      .object({
                        id: z.string(),
                        display_name: z.string(),
                      })
                      .optional(),
                    domain: z
                      .object({
                        id: z.string(),
                        display_name: z.string(),
                      })
                      .optional(),
                  }),
                )
                .optional(),
              x_concepts: z
                .array(
                  z.object({
                    id: z.string(),
                    wikidata: z.string().optional(),
                    display_name: z.string(),
                    level: z.number(),
                    score: z.number(),
                  }),
                )
                .optional(),
              counts_by_year: z
                .array(
                  z.object({
                    year: z.number(),
                    works_count: z.number(),
                    cited_by_count: z.number(),
                  }),
                )
                .optional(),
              works_api_url: z.string().optional(),
              updated_date: z.string().optional(),
              created_date: z.string().optional(),
            }),
          }),
        },
      },
    },
  },
};
export const getAuthorWorksOperation: ZodOpenApiOperationObject = {
  operationId: 'getAuthorWorks',
  tags: ['Authors'],
  summary: 'Get author works by ORCID or OpenAlex ID',
  requestParams: {
    path: getAuthorWorksSchema.shape.params,
    query: getAuthorWorksSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              meta: z.object({
                page: z.number().default(1),
                limit: z.number().default(200),
              }),
              works: z.array(
                z
                  .object({
                    id: z.string(),
                    doi: z.string().optional(),
                    title: z.string(),
                    display_name: z.string(),
                    publication_year: z.number().optional(),
                    publication_date: z.string().optional(),
                    cited_by_count: z.number().optional(),
                    is_retracted: z.boolean().optional(),
                    is_paratext: z.boolean().optional(),
                    type: z.string().optional(),
                    type_crossref: z.string().optional(),
                    open_access: z
                      .object({
                        is_oa: z.boolean(),
                        oa_status: z.string(),
                        oa_url: z.string().optional(),
                      })
                      .optional(),
                    authorships: z
                      .array(
                        z.object({
                          author_position: z.string(),
                          author: z.object({
                            id: z.string(),
                            display_name: z.string(),
                            orcid: z.string().optional(),
                          }),
                          institutions: z
                            .array(
                              z.object({
                                id: z.string(),
                                display_name: z.string(),
                                ror: z.string().optional(),
                                country_code: z.string().optional(),
                                type: z.string().optional(),
                              }),
                            )
                            .optional(),
                        }),
                      )
                      .optional(),
                    primary_location: z
                      .object({
                        source: z
                          .object({
                            id: z.string(),
                            display_name: z.string(),
                            issn_l: z.string().optional(),
                            issn: z.array(z.string()).optional(),
                            host_organization: z.string().optional(),
                            type: z.string().optional(),
                          })
                          .optional(),
                        license: z.string().optional(),
                        version: z.string().optional(),
                        landing_page_url: z.string().optional(),
                        pdf_url: z.string().optional(),
                        is_oa: z.boolean().optional(),
                        oa_status: z.string().optional(),
                      })
                      .optional(),
                  })
                  .passthrough(),
              ),
            }),
          }),
        },
      },
    },
  },
};

export const getAuthorPublishedNodesOperation: ZodOpenApiOperationObject = {
  operationId: 'getAuthorPublishedNodes',
  tags: ['Authors'],
  summary: 'Get author published nodes by ORCID ID',
  requestParams: {
    path: getAuthorNodesSchema.shape.params,
    query: getAuthorNodesSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              meta: z.object({
                g: z.string().optional().describe('Optional ipfs gateway provider link'),
                page: z.coerce.number().optional().default(1).describe('Page number for pagination of author works'),
                limit: z.coerce.number().optional().default(20).describe('Number of works to return per page'),
              }),
              nodes: z.array(
                z.object({
                  dpid: z.number().optional(),
                  title: z.string(),
                  versionIx: z.number(),
                  publishedAt: z.date(),
                  createdAt: z.date(),
                  isPublished: z.literal(true),
                  uuid: z.string(),
                }),
              ),
            }),
          }),
        },
      },
    },
  },
};

export const authorPaths: ZodOpenApiPathsObject = {
  '/v1/authors/{id}': {
    get: getAuthorProfileOperation,
  },

  '/v1/authors/{id}/works': {
    get: getAuthorWorksOperation,
  },
  '/v1/authors/{orcid}/publishedNodes': {
    get: getAuthorPublishedNodesOperation,
  },
};
