import 'zod-openapi/extend';
import { z } from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

// ---------------------------------------------
//  Schemas
// ---------------------------------------------

const mystImportParamsSchema = z.object({
  uuid: z.string().describe('The UUID of the target node'),
  jobId: z.string().describe('The unique job identifier').optional(),
});

const mystImportBodySchema = z.object({
  url: z
    .string()
    .url()
    .regex(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+\.ya?ml)$/)
    .describe('GitHub URL to the MyST YAML file'),
  dryRun: z.boolean().optional().default(false).describe('If true, validates the import without executing it'),
});

const mystImportUpdateStatusBodySchema = z.object({
  status: z.enum(['processing', 'completed', 'failed', 'cancelled']).describe('New job status'),
  message: z.string().describe('Human-readable status message'),
});

const authorSchema = z.object({
  name: z.string().describe('Author name'),
  email: z.string().email().optional().describe('Author email'),
  affiliation: z.string().optional().describe('Author affiliation'),
  orcid: z.string().optional().describe('Author ORCID'),
});

const licenseSchema = z.object({
  content: z
    .object({
      id: z.string().describe('Content license ID'),
    })
    .optional(),
  code: z
    .object({
      id: z.string().describe('Code license ID'),
    })
    .optional(),
});

const parsedDocumentSchema = z.object({
  title: z.string().describe('Project title'),
  description: z.string().describe('Project description'),
  authors: z.array(authorSchema).optional().describe('Project authors'),
  license: licenseSchema.optional().describe('Project license'),
  keywords: z.array(z.string()).optional().describe('Project keywords'),
  affiliations: z
    .array(
      z.object({
        name: z.string().describe('Affiliation name'),
      }),
    )
    .optional()
    .describe('Author affiliations'),
});

const contributorSchema = z.object({
  id: z.string().describe('Contributor ID'),
  name: z.string().describe('Contributor name'),
  role: z.array(z.string()).describe('Contributor roles'),
  email: z.string().email().optional().describe('Contributor email'),
  orcid: z.string().optional().describe('Contributor ORCID'),
  organizations: z
    .array(
      z.object({
        id: z.string().describe('Organization ID'),
        name: z.string().describe('Organization name'),
      }),
    )
    .optional()
    .describe('Contributor organizations'),
});

const actionSchema = z.object({
  type: z
    .enum(['Update Title', 'Update Description', 'Set Contributors', 'Update License', 'Set Keywords'])
    .describe('Action type'),
  title: z.string().optional().describe('Title for Update Title action'),
  description: z.string().optional().describe('Description for Update Description action'),
  contributors: z.array(contributorSchema).optional().describe('Contributors for Set Contributors action'),
  defaultLicense: z.string().optional().describe('Default license for Update License action'),
  keywords: z.array(z.string()).optional().describe('Keywords for Set Keywords action'),
});

const mystImportJobSchema = z.object({
  uuid: z.string().describe('The UUID of the target node'),
  url: z.string().describe('The original GitHub URL that was imported'),
  userId: z.number().describe('ID of the user who initiated the import'),
  status: z.enum(['processing', 'completed', 'failed', 'cancelled']).describe('Current job status'),
  message: z.string().describe('Human-readable status message'),
  parsedDocument: parsedDocumentSchema.describe('The parsed MyST document metadata'),
});

// ---------------------------------------------
//  POST /v1/nodes/:uuid/github-myst-import
// ---------------------------------------------
export const githubMystImportOperation: ZodOpenApiOperationObject = {
  operationId: 'githubMystImport',
  tags: ['Nodes'],
  summary: 'Initiate MyST document import from GitHub',
  description:
    'Initiates a MyST document import from a GitHub repository into a DeSci Nodes research object. Supports asynchronous processing with job status tracking.',
  requestParams: {
    path: mystImportParamsSchema.pick({ uuid: true }),
  },
  requestBody: {
    description: 'MyST import request payload',
    required: true,
    content: {
      'application/json': {
        schema: mystImportBodySchema,
      },
    },
  },
  responses: {
    '200': {
      description: 'Import initiated successfully or validation completed (dry run)',
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              jobId: z
                .string()
                .optional()
                .describe('Unique identifier for tracking the import job (only present when dryRun=false)'),
              ok: z.boolean().optional().describe('Indicates successful validation (only present in dry run mode)'),
              debug: z
                .object({
                  actions: z.array(actionSchema).describe('Parsed actions to be applied'),
                  parsedDocument: parsedDocumentSchema.describe('Parsed MyST document'),
                })
                .optional()
                .describe('Debug information including parsed actions and document (only for @desci.com users)'),
            }),
          }),
        },
      },
    },
    '400': {
      description: 'Bad Request - Invalid URL format or YAML validation failed',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    '404': {
      description: 'Not Found - Node not found or not initialized',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    '422': {
      description: 'Unprocessable Entity - Unable to extract metadata from manuscript',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    '500': {
      description: 'Internal Server Error - Failed to schedule job',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

// ---------------------------------------------
//  GET /v1/nodes/:uuid/github-myst-import/:jobId
// ---------------------------------------------
export const getMystImportJobStatusOperation: ZodOpenApiOperationObject = {
  operationId: 'getMystImportJobStatus',
  tags: ['Nodes'],
  summary: 'Get MyST import job status',
  description:
    'Retrieves the current status of a MyST import job including processing state, completion status, and any error messages.',
  requestParams: {
    path: mystImportParamsSchema,
  },
  responses: {
    '200': {
      description: 'Job status retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: mystImportJobSchema,
          }),
        },
      },
    },
    '404': {
      description: 'Not Found - Job not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

// ---------------------------------------------
//  POST /v1/nodes/:uuid/github-myst-import/:jobId/cancel
// ---------------------------------------------
export const cancelMystImportJobOperation: ZodOpenApiOperationObject = {
  operationId: 'cancelMystImportJob',
  tags: ['Nodes'],
  summary: 'Cancel MyST import job',
  description:
    'Cancels a running MyST import job. The job status will be updated to "cancelled" and no further processing will occur.',
  requestParams: {
    path: mystImportParamsSchema,
  },
  responses: {
    '200': {
      description: 'Job cancelled successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: mystImportJobSchema,
          }),
        },
      },
    },
    '404': {
      description: 'Not Found - Job not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

// ---------------------------------------------
//  POST /v1/nodes/:uuid/github-myst-import/:jobId/updateStatus
// ---------------------------------------------
export const updateMystImportJobStatusOperation: ZodOpenApiOperationObject = {
  operationId: 'updateMystImportJobStatus',
  tags: ['Nodes'],
  summary: 'Update MyST import job status',
  description: 'Updates the status of a MyST import job. This is an internal endpoint used by the processing service.',
  requestParams: {
    path: mystImportParamsSchema,
  },
  requestBody: {
    description: 'Job status update payload',
    required: true,
    content: {
      'application/json': {
        schema: mystImportUpdateStatusBodySchema,
      },
    },
  },
  responses: {
    '200': {
      description: 'Job status updated successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: mystImportJobSchema,
          }),
        },
      },
    },
    '404': {
      description: 'Not Found - Job not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

// ---------------------------------------------
//  POST /v1/nodes/:uuid/finalize-myst-import/:jobId/receiveFiles
// ---------------------------------------------
export const processMystImportFilesOperation: ZodOpenApiOperationObject = {
  operationId: 'processMystImportFiles',
  tags: ['Nodes'],
  summary: 'Process MyST import files',
  description:
    'Receives and processes files from the MyST import job. This is an internal endpoint used by the processing service.',
  requestParams: {
    path: mystImportParamsSchema,
  },
  requestBody: {
    description: 'Multipart form data with files to process',
    required: true,
    content: {
      'multipart/form-data': {
        schema: z.object({
          files: z.array(z.any()).describe('Files to be processed and imported'),
        }),
      },
    },
  },
  responses: {
    '200': {
      description: 'Files processed and imported successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: mystImportJobSchema,
          }),
        },
      },
    },
    '400': {
      description: 'Bad Request - No files received',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    '404': {
      description: 'Not Found - Job not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    '422': {
      description: 'Unprocessable Entity - Could not process files',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

// ---------------------------------------------
//  Export paths
// ---------------------------------------------
export const mystImportPaths: ZodOpenApiPathsObject = {
  '/v1/nodes/{uuid}/github-myst-import': {
    post: githubMystImportOperation,
  },
  '/v1/nodes/{uuid}/github-myst-import/{jobId}': {
    get: getMystImportJobStatusOperation,
  },
  '/v1/nodes/{uuid}/github-myst-import/{jobId}/cancel': {
    post: cancelMystImportJobOperation,
  },
  '/v1/nodes/{uuid}/github-myst-import/{jobId}/updateStatus': {
    post: updateMystImportJobStatusOperation,
  },
  '/v1/nodes/{uuid}/finalize-myst-import/{jobId}/receiveFiles': {
    post: processMystImportFilesOperation,
  },
};
