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
                nextPage: z.number().nullable().describe('Next page number if more results are available'),
                count: z.number().describe('Total number of works'),
                page: z.number().describe('Current page number'),
                perPage: z.number().describe('Number of works per page'),
              }),
              works: z.array(
                z.object({
                  id: z.string().describe('OpenAlex work ID'),
                  doi: z.string().optional().describe('Digital Object Identifier'),
                  title: z.string().describe('Work title'),
                  display_name: z.string().describe('Display name of the work'),
                  publication_date: z.string().optional().describe('Publication date'),
                  ids: z
                    .object({
                      openalex: z.string().optional().describe('OpenAlex identifier URL'),
                      doi: z.string().optional().describe('DOI URL'),
                      mag: z.string().optional().describe('Microsoft Academic Graph identifier'),
                      pmid: z.string().optional().describe('PubMed identifier URL'),
                      pmcid: z.string().optional().describe('PubMed Central identifier URL'),
                    })
                    .optional()
                    .describe('Additional identifiers for the work'),
                  cited_by_count: z.number().optional().describe('Number of citations'),
                  open_access: z
                    .object({
                      is_oa: z.boolean().describe('Whether the work is open access'),
                      oa_status: z.string().describe('Open access status'),
                      oa_url: z.string().optional().describe('Open access URL'),
                    })
                    .optional()
                    .describe('Open access information'),
                  authorships: z
                    .array(
                      z.object({
                        author: z.object({
                          id: z.string().describe('Author ID'),
                          display_name: z.string().describe('Author name'),
                          orcid: z.string().optional().describe('Author ORCID'),
                        }),
                        institutions: z
                          .array(
                            z.object({
                              id: z.string().describe('Institution ID'),
                              display_name: z.string().describe('Institution name'),
                              ror: z.string().optional().describe('ROR identifier'),
                              country_code: z.string().optional().describe('Country code'),
                              type: z.string().optional().describe('Institution type'),
                            }),
                          )
                          .optional()
                          .describe('Author institutions'),
                      }),
                    )
                    .optional()
                    .describe('Author information'),
                  primary_location: z
                    .object({
                      source: z
                        .object({
                          id: z.string().describe('Source ID'),
                          display_name: z.string().describe('Source name'),
                          issn_l: z.string().optional().describe('ISSN-L'),
                          issn: z.array(z.string()).optional().describe('ISSNs'),
                          host_organization: z.string().optional().describe('Host organization'),
                          type: z.string().optional().describe('Source type'),
                        })
                        .optional()
                        .describe('Publication source'),
                      license: z.string().optional().describe('License information'),
                      version: z.string().optional().describe('Version information'),
                      landing_page_url: z.string().optional().describe('Landing page URL'),
                      pdf_url: z.string().optional().describe('PDF URL'),
                      is_oa: z.boolean().optional().describe('Whether the work is open access'),
                      oa_status: z.string().optional().describe('Open access status'),
                    })
                    .optional()
                    .describe('Primary publication location'),
                  created_date: z.string().optional().describe('Creation date'),
                }),
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
