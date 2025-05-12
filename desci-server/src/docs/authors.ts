import { z } from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

import {
  getAuthorNodesSchema,
  getAuthorSchema,
  getAuthorWorksSchema,
  getCoauthorSchema,
} from '../controllers/authors/index.js';

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
              id: z.string().describe('OpenAlex ID of the author'),
              orcid: z.string().optional().describe('ORCID identifier of the author'),
              display_name: z.string().describe('Display name of the author'),
              display_name_alternatives: z.array(z.string()).optional().describe('Alternative display names'),
              works_count: z.number().optional().describe('Number of works by the author'),
              cited_by_count: z.number().optional().describe('Number of citations received'),
              summary_stats: z
                .object({
                  h_index: z.number().describe('H-index of the author'),
                  i10_index: z.number().describe('i10-index of the author'),
                  '2yr_mean_citedness': z.number().describe('Mean citations in the last 2 years'),
                })
                .optional(),
              ids: z
                .object({
                  openalex: z.string().optional().describe('OpenAlex identifier'),
                  orcid: z.string().optional().describe('ORCID identifier'),
                })
                .optional(),
              affiliations: z
                .array(
                  z.object({
                    institution: z.object({
                      id: z.string().describe('Institution identifier'),
                      ror: z.string().optional().describe('ROR identifier of the institution'),
                      display_name: z.string().describe('Name of the institution'),
                      country_code: z.string().optional().describe('Country code of the institution'),
                      type: z.string().optional().describe('Type of institution'),
                      lineage: z.array(z.string()).optional().describe('Hierarchical lineage of the institution'),
                    }),
                    years: z.array(z.number()).optional().describe('Years of affiliation'),
                  }),
                )
                .optional()
                .describe('Author affiliations'),
              last_known_institutions: z
                .array(
                  z.object({
                    id: z.string().describe('Institution identifier'),
                    ror: z.string().optional().describe('ROR identifier of the institution'),
                    display_name: z.string().describe('Name of the institution'),
                    country_code: z.string().optional().describe('Country code of the institution'),
                    type: z.string().optional().describe('Type of institution'),
                    lineage: z.array(z.string()).optional().describe('Hierarchical lineage of the institution'),
                  }),
                )
                .optional()
                .describe('Last known institutions of the author'),
              topics: z
                .array(
                  z.object({
                    id: z.string().describe('Topic identifier'),
                    display_name: z.string().describe('Topic name'),
                    count: z.number().optional().describe('Number of works in this topic'),
                    subfield: z
                      .object({
                        id: z.string().describe('Subfield identifier'),
                        display_name: z.string().describe('Subfield name'),
                      })
                      .optional(),
                    field: z
                      .object({
                        id: z.string().describe('Field identifier'),
                        display_name: z.string().describe('Field name'),
                      })
                      .optional(),
                    domain: z
                      .object({
                        id: z.string().describe('Domain identifier'),
                        display_name: z.string().describe('Domain name'),
                      })
                      .optional(),
                  }),
                )
                .optional()
                .describe('Research topics of the author'),
              topic_share: z
                .array(
                  z.object({
                    id: z.string().describe('Topic identifier'),
                    display_name: z.string().describe('Topic name'),
                    value: z.number().describe('Share value (0-100)'),
                    subfield: z
                      .object({
                        id: z.string().describe('Subfield identifier'),
                        display_name: z.string().describe('Subfield name'),
                      })
                      .optional(),
                    field: z
                      .object({
                        id: z.string().describe('Field identifier'),
                        display_name: z.string().describe('Field name'),
                      })
                      .optional(),
                    domain: z
                      .object({
                        id: z.string().describe('Domain identifier'),
                        display_name: z.string().describe('Domain name'),
                      })
                      .optional(),
                  }),
                )
                .optional()
                .describe("Topic distribution of author's research"),
              x_concepts: z
                .array(
                  z.object({
                    id: z.string().describe('Concept identifier'),
                    wikidata: z.string().optional().describe('Wikidata identifier'),
                    display_name: z.string().describe('Concept name'),
                    level: z.number().describe('Concept hierarchy level'),
                    score: z.number().describe('Relevance score'),
                  }),
                )
                .optional()
                .describe("Concepts associated with the author's work"),
              counts_by_year: z
                .array(
                  z.object({
                    year: z.number().describe('Publication year'),
                    works_count: z.number().describe('Number of works published'),
                    cited_by_count: z.number().describe('Number of citations received'),
                  }),
                )
                .optional()
                .describe('Publication and citation counts by year'),
              works_api_url: z.string().optional().describe("URL to fetch author's works"),
              updated_date: z.string().optional().describe('Last update date'),
              created_date: z.string().optional().describe('Creation date'),
              employment: z
                .array(
                  z.object({
                    organization: z.object({
                      name: z.string().describe('Organization name'),
                      location: z.string().optional().describe('City Region Country').optional(),
                      department: z.string().optional().describe('Department name'),
                    }),
                    title: z.string().optional().describe('Job title'),
                    startDate: z.string().optional().describe('Employment start date'),
                    endDate: z.string().optional().describe('Employment end date'),
                  }),
                )
                .optional()
                .describe('Employment history from ORCID'),
              education: z
                .array(
                  z.object({
                    organization: z.object({
                      name: z.string().describe('Organization name'),
                      location: z.string().optional().describe('City Region Country').optional(),
                      department: z.string().optional().describe('Department name'),
                    }),
                    title: z.string().optional().describe('Degree'),
                    startDate: z.string().optional().describe('Education start date'),
                    endDate: z.string().optional().describe('Education end date'),
                  }),
                )
                .optional()
                .describe('Education history from ORCID'),
              bibiometrics: z.object({
                firstPubYear: z.number().optional().describe('First publication year'),
                citation_count: z.number().optional().describe('Total number of citations'),
                m_index: z.number().optional().describe('M-index of the author'),
                contemporary_h_index: z.number().optional().describe('Contemporary h-index of the author'),
              }),
            }),
          }),
        },
      },
    },
  },
};

export const getCoAuthorsOperation: ZodOpenApiOperationObject = {
  operationId: 'getCoAuthors',
  tags: ['Authors'],
  summary: 'Get co-authors for an author by ORCID or OpenAlex ID',
  requestParams: {
    path: getCoauthorSchema.shape.params,
    query: getCoauthorSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successful operation',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(
              z.object({
                id: z.string().describe('OpenAlex ID of the co-author'),
                name: z.string().describe('Display name of the co-author'),
                orcid: z.string().optional().describe('ORCID identifier of the co-author'),
              }),
            ),
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
                  authors: z
                    .array(
                      z.object({
                        id: z.string(),
                        name: z.string(),
                        orcid: z.string().optional(),
                        organizations: z
                          .array(
                            z.object({
                              id: z.string(),
                              name: z.string(),
                            }),
                          )
                          .optional(),
                        role: z.array(z.string()).optional(),
                      }),
                    )
                    .optional(),
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
  '/v1/authors/{id}/coauthors': {
    get: getCoAuthorsOperation,
  },
  '/v1/authors/{id}/works': {
    get: getAuthorWorksOperation,
  },
  '/v1/authors/{orcid}/publishedNodes': {
    get: getAuthorPublishedNodesOperation,
  },
};
