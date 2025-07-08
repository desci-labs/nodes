import 'zod-openapi/extend';
import z from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

import { retrieveDpidSchema } from '../controllers/dpid/schema.js';

// Define the author schema based on ResearchObjectV1Author interface
const authorSchema = z.object({
  id: z.string().optional().describe('Random UUID to identify the contributor'),
  name: z.string().describe('Name of the contributor'),
  orcid: z.string().optional().describe('Orcid handle of the contributor'),
  googleScholar: z.string().optional().describe('Google Scholar profile of the contributor'),
  role: z
    .union([
      z.enum(['Author', 'Node Steward']),
      z.array(z.enum(['Author', 'Node Steward'])),
      z.string(),
      z.array(z.string()),
    ])
    .describe('Type of role in the publication'),
  organizations: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        subtext: z.string().optional(),
      }),
    )
    .optional()
    .describe('Organizations the contributor is affiliated with'),
  github: z.string().optional().describe('GitHub profile of the contributor'),
  nodesUserId: z.number().optional().describe('Desci Nodes user id'),
});

// Define the DPID metadata response schema
const dpidMetadataSchema = z.object({
  title: z.string().describe('Title of the research object'),
  abstract: z.string().describe('Abstract/description of the research object'),
  authors: z.array(authorSchema).describe('List of authors/contributors'),
  doi: z.string().optional().describe('DOI associated with the research object'),
  publicationYear: z.number().optional().describe('Year of publication'),
  pdfUrl: z.string().describe('URL to access the PDF version of the research object'),
});

export const retrieveDpidMetadataOperation: ZodOpenApiOperationObject = {
  operationId: 'retrieveDpidMetadata',
  tags: ['DPID'],
  summary: 'Retrieve metadata for a research object by DPID',
  description:
    'Retrieves comprehensive metadata for a research object identified by its DPID (Decentralized Persistent Identifier). This includes title, abstract, authors, DOI, publication year, and PDF access URL. Optionally supports versioning to retrieve metadata for specific versions of the research object.',
  requestParams: {
    path: retrieveDpidSchema.shape.params,
    query: retrieveDpidSchema.shape.query,
  },
  responses: {
    '200': {
      description: 'Successful operation - DPID metadata retrieved',
      content: {
        'application/json': {
          schema: z.object({
            data: dpidMetadataSchema,
          }),
        },
      },
    },
    '404': {
      description: 'DPID not found or no published version available',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string().describe('Error message indicating the DPID was not found or has no published versions'),
          }),
        },
      },
    },
    '400': {
      description: 'Invalid DPID format or version parameter',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string().describe('Error message indicating invalid request parameters'),
          }),
        },
      },
    },
    '500': {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string().describe('Internal server error message'),
          }),
        },
      },
    },
  },
};

export const dpidPaths: ZodOpenApiPathsObject = {
  '/v1/dpid/{dpid}': {
    get: retrieveDpidMetadataOperation,
  },
};
