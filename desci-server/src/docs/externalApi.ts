export const externalApiDocs = {
  '/services/ai/referee-recommender/presigned-url': {
    post: {
      tags: ['External API'],
      summary: 'Generate presigned URL for PDF upload',
      description: 'Generate a presigned S3 URL for uploading a PDF file to be processed by the ML Referee Recommender',
      security: [
        {
          bearerAuth: [],
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                fileName: {
                  type: 'string',
                  description: 'Original filename of the PDF to upload',
                  example: 'research-paper.pdf',
                },
              },
              required: ['fileName'],
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Presigned URL generated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  presignedUrl: {
                    type: 'string',
                    description: 'Presigned S3 URL for file upload',
                  },
                  fileName: {
                    type: 'string',
                    description: 'Generated filename with version prefix',
                  },
                  expiresIn: {
                    type: 'number',
                    description: 'URL expiration time in seconds',
                    example: 3600,
                  },
                },
              },
            },
          },
        },
        400: {
          description: 'Bad request - invalid fileName or file type',
        },
        401: {
          description: 'Unauthorized - authentication required',
        },
        500: {
          description: 'Internal server error',
        },
      },
    },
  },
  '/services/ai/referee-recommender/trigger': {
    post: {
      tags: ['External API'],
      summary: 'Trigger ML referee recommendation',
      description: 'Initiate the ML referee recommendation process using a CID (Content Identifier)',
      security: [
        {
          bearerAuth: [],
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                cid: {
                  type: 'string',
                  description: 'IPFS CID of the uploaded PDF file',
                  example: 'bafybeidrkxgc25km73zhedrprkwxv6amgl3i5jgct4vkgtst6l75gocyt4',
                },
                external: {
                  type: 'boolean',
                  description: 'Whether to use external IPFS gateway',
                  default: false,
                },
                top_n_closely_matching: {
                  type: 'integer',
                  description: 'Number of closely matching works to fetch',
                  minimum: 1,
                  maximum: 50,
                  default: 5,
                },
                number_referees: {
                  type: 'integer',
                  description: 'Number of referees to return',
                  minimum: 1,
                  maximum: 50,
                  default: 10,
                },
                force_run: {
                  type: 'boolean',
                  description: 'Force reprocessing even if data exists',
                  default: false,
                },
                classify: {
                  type: 'boolean',
                  description: 'Whether to run topic classification',
                },
                coi_filter: {
                  type: 'object',
                  description: 'Conflict of interest filter settings',
                  properties: {
                    co_author_overlap: {
                      type: 'boolean',
                      description: 'Filter co-author overlap',
                    },
                    institution_overlap: {
                      type: 'boolean',
                      description: 'Filter institutional affiliation overlap',
                    },
                    supervisor_supervisee_check: {
                      type: 'boolean',
                      description: 'Filter supervisor/mentee relationships',
                    },
                  },
                },
                meta_data_only: {
                  type: 'boolean',
                  description: 'If true, returns metadata without computing recommendations',
                },
                exclude_fields: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  description: 'List of OpenAlex field IDs to exclude',
                },
                exclude_works: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  description: 'Lists of DOIs or OpenAlex IDs to exclude',
                },
                exclude_authors: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  description: 'List of author IDs to exclude',
                },
              },
              required: ['cid'],
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Referee recommendation process triggered successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  execution_arn: {
                    type: 'string',
                    description: 'AWS Step Function execution ARN',
                  },
                  uploaded_file_name: {
                    type: 'string',
                    description: 'File identifier for polling results',
                  },
                  api_version: {
                    type: 'string',
                    description: 'API version used',
                    example: 'v0.1.3',
                  },
                  info: {
                    type: 'string',
                    description: 'Process status information',
                    example: 'Submitted for execution',
                  },
                },
              },
            },
          },
        },
        400: {
          description: 'Bad request - invalid CID or parameters',
        },
        401: {
          description: 'Unauthorized - authentication required',
        },
        500: {
          description: 'Internal server error',
        },
      },
    },
  },
  '/services/ai/referee-recommender/results': {
    get: {
      tags: ['External API'],
      summary: 'Get referee recommendation results',
      description: 'Retrieve the results of a previously triggered referee recommendation process',
      security: [
        {
          bearerAuth: [],
        },
      ],
      parameters: [
        {
          name: 'UploadedFileName',
          in: 'query',
          required: true,
          schema: {
            type: 'string',
          },
          description: 'File identifier returned from the trigger endpoint',
          example: 'referee_rec_v0.1.3_bafybeidrkxgc25km73zhedrprkwxv6amgl3i5jgct4vkgtst6l75gocyt4',
        },
      ],
      responses: {
        200: {
          description: 'Referee recommendation results retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    description: 'Processing status',
                    enum: ['RUNNING: 5', 'SUCCEEDED', 'FAILED'],
                  },
                  UploadedFileName: {
                    type: 'string',
                    description: 'File identifier',
                  },
                  result: {
                    type: 'object',
                    description: 'Full recommendation results (when status is SUCCEEDED)',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          paper_data: {
                            type: 'object',
                            description: 'Metadata about the input paper',
                            properties: {
                              title: { type: 'string' },
                              pub_year: { type: 'number' },
                              abstract: { type: 'string' },
                              raw_author_info: { type: 'array', items: { type: 'object' } },
                              author_ids: { type: 'array', items: { type: 'string' } },
                            },
                          },
                          focal_authors_data: {
                            type: 'array',
                            description: 'Information about the paper authors',
                            items: { type: 'object' },
                          },
                          referees: {
                            type: 'object',
                            description: 'Referee recommendations',
                            properties: {
                              recommended: {
                                type: 'array',
                                description: 'List of recommended referees',
                                items: { type: 'object' },
                              },
                              fields: {
                                type: 'object',
                                description: 'Referees grouped by research fields',
                              },
                              topics: {
                                type: 'object',
                                description: 'Referees grouped by research topics',
                              },
                            },
                          },
                          evaluation: {
                            type: 'object',
                            description: 'Evaluation metrics',
                            properties: {
                              referee_discovery: { type: 'object' },
                              conflic_of_interest: { type: 'object' },
                              topic_similarity: { type: 'object' },
                            },
                          },
                        },
                      },
                      runtime_data: {
                        type: 'object',
                        description: 'Processing runtime information',
                        properties: {
                          cid: { type: 'string' },
                          runtime: { type: 'number', description: 'Processing time in seconds' },
                          retained_after_coi: { type: 'number' },
                          number_of_focal_authors: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          description: 'Bad request - invalid UploadedFileName',
        },
        401: {
          description: 'Unauthorized - authentication required',
        },
        404: {
          description: 'Results not found or access denied',
        },
        500: {
          description: 'Internal server error',
        },
      },
    },
  },
  '/services/ai/referee-recommender/usage': {
    get: {
      tags: ['External API'],
      summary: 'Get referee recommender usage status',
      description:
        'Retrieve the current usage status for the authenticated user including feature limits, used count, remaining quota, and plan information based on their subscription',
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: 'Usage status retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  totalLimit: {
                    type: ['integer', 'null'],
                    description: 'Maximum number of requests allowed in the billing period (null = unlimited)',
                    example: 10,
                  },
                  totalUsed: {
                    type: 'integer',
                    description: 'Number of requests used in the current billing period',
                    example: 3,
                  },
                  totalRemaining: {
                    type: ['integer', 'null'],
                    description: 'Number of requests remaining in the current billing period (null = unlimited)',
                    example: 7,
                  },
                  planCodename: {
                    type: 'string',
                    description: 'User subscription plan codename',
                    enum: ['FREE', 'STARTER', 'PRO', 'CUSTOM'],
                    example: 'STARTER',
                  },
                  isWithinLimit: {
                    type: 'boolean',
                    description: 'Whether the user is currently within their usage limits',
                    example: true,
                  },
                },
                required: ['totalLimit', 'totalUsed', 'totalRemaining', 'planCodename', 'isWithinLimit'],
              },
            },
          },
        },
        401: {
          description: 'Unauthorized - authentication required',
        },
        500: {
          description: 'Internal server error - failed to retrieve usage status',
        },
      },
    },
  },
  '/services/ai/research-assistant/usage': {
    get: {
      tags: ['External API'],
      summary: 'Get research assistant usage status',
      description:
        'Retrieve the current usage status for the authenticated user including feature limits, used count, remaining quota, and plan information for the Research Assistant feature',
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: 'Usage status retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  totalLimit: {
                    type: ['integer', 'null'],
                    description: 'Maximum number of chat requests allowed in the billing period (null = unlimited)',
                    example: 10,
                  },
                  totalUsed: {
                    type: 'integer',
                    description: 'Number of chat requests used in the current billing period',
                    example: 3,
                  },
                  totalRemaining: {
                    type: ['integer', 'null'],
                    description: 'Number of chat requests remaining in the current billing period (null = unlimited)',
                    example: 7,
                  },
                  planCodename: {
                    type: 'string',
                    description: 'User subscription plan codename',
                    enum: ['FREE', 'STARTER', 'PRO', 'CUSTOM'],
                    example: 'FREE',
                  },
                  isWithinLimit: {
                    type: 'boolean',
                    description: 'Whether the user is currently within their usage limits',
                    example: true,
                  },
                },
                required: ['totalLimit', 'totalUsed', 'totalRemaining', 'planCodename', 'isWithinLimit'],
              },
            },
          },
        },
        401: {
          description: 'Unauthorized - authentication required',
        },
        500: {
          description: 'Internal server error - failed to retrieve usage status',
        },
      },
    },
  },
  '/services/ai/research-assistant/onboard-usage': {
    post: {
      tags: ['External API'],
      summary: 'Onboard guest usage to user account',
      description:
        "Creates usage entries for anonymous/guest chats when a user signs up. This maintains usage continuity by adding 0-4 usage records to the user's account based on their pre-signup activity.",
      security: [
        {
          bearerAuth: [],
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                guestUsageCount: {
                  type: 'integer',
                  description: 'Number of chat requests used as a guest (0-4)',
                  minimum: 0,
                  maximum: 4,
                  example: 3,
                },
              },
              required: ['guestUsageCount'],
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Guest usage onboarded successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                    description: 'Success message',
                    example: 'Success',
                  },
                  currentStatus: {
                    type: 'object',
                    description: 'Updated usage status after onboarding',
                    properties: {
                      totalLimit: {
                        type: ['integer', 'null'],
                        description: 'Maximum number of chat requests allowed in the billing period',
                        example: 10,
                      },
                      totalUsed: {
                        type: 'integer',
                        description: 'Number of chat requests used in the current billing period',
                        example: 3,
                      },
                      totalRemaining: {
                        type: ['integer', 'null'],
                        description: 'Number of chat requests remaining in the current billing period',
                        example: 7,
                      },
                      isWithinLimit: {
                        type: 'boolean',
                        description: 'Whether the user is currently within their usage limits',
                        example: true,
                      },
                    },
                    required: ['totalLimit', 'totalUsed', 'totalRemaining', 'isWithinLimit'],
                  },
                },
                required: ['message', 'currentStatus'],
              },
            },
          },
        },
        400: {
          description: 'Bad request - guestUsageCount must be between 0 and 4',
        },
        401: {
          description: 'Unauthorized - authentication required',
        },
        500: {
          description: 'Internal server error',
        },
      },
    },
  },
};

export const externalApiComponents = {
  schemas: {
    RefereeRecommenderTriggerRequest: {
      type: 'object',
      properties: {
        cid: {
          type: 'string',
          description: 'IPFS CID of the uploaded PDF file',
        },
        external: {
          type: 'boolean',
          description: 'Whether to use external IPFS gateway',
          default: false,
        },
        top_n_closely_matching: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 5,
        },
        number_referees: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 10,
        },
        force_run: {
          type: 'boolean',
          default: false,
        },
      },
      required: ['cid'],
    },
  },
};
