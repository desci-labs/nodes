import { z } from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

// Schemas
const FileHashSchema = z.object({
  fileHash: z.string().min(1).describe('SHA-256 hash of the file content'),
  fileName: z.string().min(1).describe('Original filename'),
});

const PresignedUrlResponseSchema = z.object({
  cached: z.boolean().describe('Whether results are cached'),
  presignedUrl: z.string().optional().describe('S3 presigned upload URL'),
  downloadUrl: z.string().optional().describe('S3 download URL'),
  fileName: z.string().optional().describe('Generated S3 filename'),
  fileHash: z.string().optional().describe('File hash'),
  resultKey: z.string().optional().describe('Formatted cache key for results'),
  message: z.string().optional().describe('Cache message'),
});

const TriggerRefereeRequestSchema = z.object({
  fileUrl: z.string().url().describe('URL to the PDF file'),
  fileHash: z.string().optional().describe('SHA-256 hash of file (for caching)'),
  top_n_closely_matching: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(5)
    .describe('Number of closely matching papers to analyze'),
  number_referees: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Number of referee recommendations to return'),
  force_run: z.boolean().optional().default(false).describe('Force re-processing even if cached results exist'),
  classify: z.boolean().optional().describe('Enable classification features'),
  coi_filter: z
    .object({
      co_author_overlap: z.boolean().optional(),
      institution_overlap: z.boolean().optional(),
      supervisor_supervisee_check: z.boolean().optional(),
    })
    .optional()
    .describe('Conflict of interest filtering options'),
  meta_data_only: z.boolean().optional().describe('Return only metadata'),
  exclude_fields: z.array(z.string()).optional().describe('Research fields to exclude'),
  exclude_works: z.array(z.string()).optional().describe('Specific works to exclude'),
  exclude_authors: z.array(z.string()).optional().describe('Specific authors to exclude'),
});

const TriggerRefereeResponseSchema = z.object({
  cached: z.boolean().describe('Whether results were cached'),
  UploadedFileName: z.string().optional().describe('Backend filename for processing'),
  api_version: z.string().optional().describe('API version used'),
  info: z.string().optional().describe('Processing information'),
  resultKey: z.string().optional().describe('Formatted cache key'),
  fileHash: z.string().optional().describe('File hash'),
  createdAt: z.string().optional().describe('Creation timestamp'),
  data: z.any().optional().describe('Cached result data'),
});

const UsageStatusSchema = z.object({
  totalLimit: z.number().nullable().describe('Total monthly limit (null for unlimited)'),
  totalUsed: z.number().describe('Total requests used this month'),
  totalRemaining: z.number().nullable().describe('Remaining requests (null for unlimited)'),
  planCodename: z.string().describe('User plan identifier'),
  isWithinLimit: z.boolean().describe('Whether user is within usage limits'),
});

const RefereeResultsSchema = z.object({
  ok: z.boolean().describe('Request success status'),
  data: z
    .object({
      paper_data: z.object({
        abstract: z.string(),
        title: z.string(),
        author_info: z.array(
          z.object({
            display_name: z.string(),
          }),
        ),
        context_novelty: z.number(),
        content_novelty: z.number(),
      }),
      focal_authors_data: z.array(
        z.object({
          display_name: z.string(),
          id: z.string(),
          orcid: z.string(),
        }),
      ),
      referees: z.object({
        recommended: z.array(
          z.object({
            display_name: z.string(),
            id: z.string(),
            orcid: z.string(),
            cited_by_count: z.number(),
            affiliations: z.string(),
            h_index: z.number(),
            tags: z.array(z.string()),
            works: z.array(
              z.object({
                work_id: z.string(),
                title: z.string(),
                doi: z.string(),
                similarity_score: z.number(),
              }),
            ),
            work_similarity_score: z.number(),
            topic_similarity_score: z.number(),
            total_direct_citations: z.number().nullable(),
            earliest_work: z.number(),
          }),
        ),
      }),
    })
    .describe('Referee recommendation results'),
});

const ErrorResponseSchema = z.object({
  ok: z.boolean().default(false),
  message: z.string().describe('Error message'),
});

// Operations
export const generatePresignedUrlOperation: ZodOpenApiOperationObject = {
  operationId: 'generatePresignedUrl',
  tags: ['AI Services'],
  summary: 'Generate presigned URL for referee recommender file upload',
  description:
    'Get a presigned S3 URL for uploading a PDF file for referee recommendation analysis. Checks for cached results first.',
  security: [{ bearerAuth: [] }],
  requestBody: {
    content: {
      'application/json': {
        schema: FileHashSchema,
      },
    },
  },
  responses: {
    '200': {
      description: 'Presigned URL generated successfully or cached results found',
      content: {
        'application/json': {
          schema: PresignedUrlResponseSchema,
        },
      },
    },
    '400': {
      description: 'Invalid request parameters',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    '401': {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
};

export const triggerRefereeRecommendationOperation: ZodOpenApiOperationObject = {
  operationId: 'triggerRefereeRecommendation',
  tags: ['AI Services'],
  summary: 'Trigger referee recommendation analysis',
  description:
    'Start processing a PDF file for referee recommendations. Supports caching and various filtering options.',
  security: [{ bearerAuth: [] }],
  requestBody: {
    content: {
      'application/json': {
        schema: TriggerRefereeRequestSchema,
      },
    },
  },
  responses: {
    '200': {
      description: 'Processing triggered successfully or cached results returned',
      content: {
        'application/json': {
          schema: TriggerRefereeResponseSchema,
        },
      },
    },
    '400': {
      description: 'Invalid request parameters',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    '401': {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    '429': {
      description: 'Rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
};

export const getRefereeResultsOperation: ZodOpenApiOperationObject = {
  operationId: 'getRefereeResults',
  tags: ['AI Services'],
  summary: 'Get referee recommendation results',
  description: 'Retrieve the results of referee recommendation analysis using the uploaded filename.',
  security: [{ bearerAuth: [] }],
  parameters: [
    {
      name: 'UploadedFileName',
      in: 'query',
      required: true,
      description: 'Backend filename from processing',
      schema: {
        type: 'string',
      },
    },
  ],
  responses: {
    '200': {
      description: 'Results retrieved successfully',
      content: {
        'application/json': {
          schema: RefereeResultsSchema,
        },
      },
    },
    '404': {
      description: 'Results not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    '401': {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
};

export const getRefereeUsageOperation: ZodOpenApiOperationObject = {
  operationId: 'getRefereeUsage',
  tags: ['AI Services'],
  summary: 'Get referee recommender usage status',
  description: 'Check current usage limits and remaining quota for referee recommender service.',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': {
      description: 'Usage status retrieved successfully',
      content: {
        'application/json': {
          schema: UsageStatusSchema,
        },
      },
    },
    '401': {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
};

export const aiServicesPaths: ZodOpenApiPathsObject = {
  '/services/ai/referee-recommender/presigned-url': {
    post: generatePresignedUrlOperation,
  },
  '/services/ai/referee-recommender/trigger': {
    post: triggerRefereeRecommendationOperation,
  },
  '/services/ai/referee-recommender/results': {
    get: getRefereeResultsOperation,
  },
  '/services/ai/referee-recommender/usage': {
    get: getRefereeUsageOperation,
  },
};
