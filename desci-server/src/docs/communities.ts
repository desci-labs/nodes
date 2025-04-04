import { z } from 'zod';
import { ZodOpenApiPathsObject } from 'zod-openapi';

import {
  getAllCommunitiesFeedSchema,
  getCommunityDetailsSchema,
  getCommunityFeedSchema,
  memberGuardSchema,
} from '../routes/v1/communities/schema.js';
import { getCommunitySubmissionsSchema } from '../routes/v1/communities/submissions-schema.js';

export const communityPaths: ZodOpenApiPathsObject = {
  '/v1/communities/list': {
    get: {
      operationId: 'listCommunities',
      summary: 'List all communities and curated nodes',
      tags: ['Communities'],
      responses: {
        '200': {
          description: 'Successful operation',
          content: {
            'application/json': {
              schema: z.array(
                z.object({
                  id: z.number(),
                  name: z.string(),
                  description: z.string(),
                  image: z.string(),
                  curatedNodes: z.array(z.any()),
                }),
              ),
            },
          },
        },
      },
    },
  },

  '/v1/communities/feed': {
    get: {
      operationId: 'listAllCommunityCuratedFeeds',
      summary: 'List all community curated feeds',
      tags: ['Communities'],
      requestParams: { query: getAllCommunitiesFeedSchema.shape.query },
      responses: {
        '200': {
          description: 'Successful operation',
          content: {
            'application/json': {
              schema: z.array(
                z.object({
                  nodeDpid10: z.string(),
                  engagements: z.object({
                    reactions: z.number(),
                    annotations: z.number(),
                    verifications: z.number(),
                  }),
                  verifiedEngagements: z.object({
                    reactions: z.number(),
                    annotations: z.number(),
                    verifications: z.number(),
                  }),
                  NodeAttestation: z.array(z.any()),
                }),
              ),
            },
          },
        },
      },
    },
  },

  '/v1/communities/{communityName}': {
    get: {
      operationId: 'getCommunityDetails',
      summary: 'Get details for a specific community',
      tags: ['Communities'],
      requestParams: { path: getCommunityDetailsSchema.shape.params },
      responses: {
        '200': {
          description: 'Successful operation',
          content: {
            'application/json': {
              schema: z.object({
                id: z.number(),
                name: z.string(),
                description: z.string(),
                image: z.string(),
                members: z.array(z.any()),
                curatedNodes: z.array(z.any()),
              }),
            },
          },
        },
      },
    },
  },

  '/v1/communities/{communityName}/attestations': {
    get: {
      operationId: 'getCommunityRecommendations',
      summary: 'Get recommendations for a community',
      tags: ['Communities', 'Attestations'],
      requestParams: { path: getCommunityDetailsSchema.shape.params },
      responses: {
        '200': {
          description: 'Successful operation',
          content: {
            'application/json': {
              schema: z.array(z.any()), // Node recommendations
            },
          },
        },
      },
    },
  },

  '/v1/communities/{communityName}/validatedAttestations': {
    get: {
      operationId: 'getValidatedAttestations',
      summary: 'Get validated attestations for a community',
      tags: ['Communities', 'Attestations'],
      requestParams: { path: getCommunityDetailsSchema.shape.params },
      responses: {
        '200': {
          description: 'Successful operation',
          content: {
            'application/json': {
              schema: z.array(z.any()), // Validated attestations
            },
          },
        },
      },
    },
  },

  '/v1/communities/{communityId}/feed': {
    get: {
      operationId: 'listCommunityFeed',
      summary: 'Get feed for a community',
      tags: ['Communities'],
      requestParams: { path: getCommunityFeedSchema.shape.params },
      responses: {
        '200': {
          description: 'Successful operation',
          content: {
            'application/json': {
              schema: z.array(
                z.object({
                  nodeDpid10: z.string(),
                  engagements: z.object({
                    reactions: z.number(),
                    annotations: z.number(),
                    verifications: z.number(),
                  }),
                  verifiedEngagements: z.object({
                    reactions: z.number(),
                    annotations: z.number(),
                    verifications: z.number(),
                  }),
                  NodeAttestation: z.array(z.any()),
                }),
              ),
            },
          },
        },
      },
    },
  },

  '/v1/communities/{communityId}/radar': {
    get: {
      operationId: 'listCommunityRadar',
      summary: 'Get radar for a community',
      tags: ['Communities'],
      requestParams: { path: getCommunityFeedSchema.shape.params },
      responses: {
        '200': {
          description: 'Successful operation',
          content: {
            'application/json': {
              schema: z.array(z.any()), // Radar nodes
            },
          },
        },
      },
    },
  },

  '/v1/communities/{communityId}/memberGuard': {
    get: {
      operationId: 'checkMemberGuard',
      summary: 'Check member guard for a community',
      tags: ['Communities'],
      requestParams: { path: memberGuardSchema.shape.params },
      security: [{ user: [] }],
      responses: {
        '200': {
          description: 'Successful operation',
          content: {
            'application/json': {
              schema: z.object({
                message: z.string(),
              }),
            },
          },
        },
        '403': {
          description: 'Forbidden - User is not a member of the community',
        },
      },
    },
  },

  '/v1/communities/{communityId}/submissions': {
    get: {
      operationId: 'getCommunitySubmissions',
      summary: 'Get submissions for a community',
      tags: ['Communities', 'Submissions'],
      requestParams: { path: getCommunitySubmissionsSchema.shape.params },
      security: [{ user: [] }],
      responses: {
        '200': {
          description: 'Successful operation',
          content: {
            'application/json': {
              schema: z.array(
                z.object({
                  id: z.number(),
                  nodeId: z.string(),
                  communityId: z.number(),
                  userId: z.number(),
                  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
                  reason: z.string().optional(),
                  createdAt: z.date(),
                  updatedAt: z.date(),
                  node: z.object({}).passthrough(),
                }),
              ),
            },
          },
        },
      },
    },
  },
};
