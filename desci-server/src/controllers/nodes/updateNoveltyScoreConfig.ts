import { User, Node } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { ElasticNodesService } from '../../services/ElasticNodesService.js';
import { NoveltyScoreConfig, updateNoveltyScoreConfig } from '../../services/node.js';

export const UpdateNoveltyScoreConfigSchema = z.object({
  hideContentNovelty: z.boolean().optional(),
  hideContextNovelty: z.boolean().optional(),
});

type UpdateNoveltyScoreConfigReqBody = z.infer<typeof UpdateNoveltyScoreConfigSchema>;

export type UpdateNoveltyScoreConfigRequest = Request<{ uuid: string }, never, UpdateNoveltyScoreConfigReqBody> & {
  user: User;
  node: Node;
};

export type UpdateNoveltyScoreConfigResBody =
  | {
      ok: true;
      message: string;
      config: NoveltyScoreConfig;
    }
  | {
      ok: false;
      error: string;
      details?: z.ZodIssue[] | string;
    };

const UpdateNoveltyScoreConfigRequestBodySchema = z
  .object({
    hideContentNovelty: z.boolean().optional(),
    hideContextNovelty: z.boolean().optional(),
  })
  .openapi({
    ref: 'UpdateNoveltyScoreConfigRequestBody',
    description: 'Configuration for hiding novelty scores.',
  });

const NoveltyScoreConfigResponseSchema = z
  .object({
    hideContentNovelty: z.boolean().optional(),
    hideContextNovelty: z.boolean().optional(),
  })
  .openapi({
    ref: 'NoveltyScoreConfigResponse',
    description: 'The current novelty score visibility configuration.',
  });

const SuccessResponseSchema = z
  .object({
    ok: z.literal(true),
    message: z.string(),
    config: NoveltyScoreConfigResponseSchema,
  })
  .openapi({ ref: 'UpdateNoveltyScoreConfigSuccessResponse' });

const ErrorResponseSchema = z
  .object({
    ok: z.literal(false),
    error: z.string(),
    details: z.union([z.array(z.object({ code: z.string(), message: z.string() })), z.string()]).optional(),
  })
  .openapi({ ref: 'ErrorResponse' });

/**
 * Updates the UI visibility of the novelty scores for a node.
 */
export const updateNoveltyScoreConfigController = async (
  req: UpdateNoveltyScoreConfigRequest,
  res: Response<UpdateNoveltyScoreConfigResBody>,
) => {
  const user = req.user;
  const node = req.node;
  const { uuid } = req.params;

  if (!user) throw Error('Middleware not properly setup for updateNoveltyScoreConfigController, requires req.user');

  const logger = parentLogger.child({
    module: 'Nodes::UpdateNoveltyScoreConfigController',
    userId: user.id,
    nodeUuid: uuid,
    body: req.body,
  });

  try {
    const validatedConfig = UpdateNoveltyScoreConfigSchema.parse(req.body);

    if (node.ownerId !== user.id) {
      logger.warn({ nodeOwnerId: node.ownerId }, `User ${user.id} does not own node: ${node.id}`);
      res.status(403).json({ ok: false, error: 'Unauthorized' });
      return;
    }

    logger.trace({ config: validatedConfig }, 'Updating novelty score config');

    const updatedNode = await updateNoveltyScoreConfig(node, validatedConfig);

    res.status(200).json({
      ok: true,
      message: 'Novelty score configuration updated successfully',
      config: updatedNode.noveltyScoreConfig as NoveltyScoreConfig,
    });

    // Background task
    // If the node is published, modify its ES entry to hide/show the novelty scores
    const publishedVersions = await prisma.nodeVersion.findMany({
      where: {
        nodeId: node.id,
        OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
      },
    });
    const isNodePublished = publishedVersions?.length > 0;
    if (isNodePublished) {
      ElasticNodesService.updateNoveltyScoreDataForEsEntry(
        node,
        updatedNode.noveltyScoreConfig as NoveltyScoreConfig,
      ).catch((err) => {
        logger.error({ err }, 'Error during background ES update for novelty score config');
      });
    }
    return;
  } catch (e) {
    if (e instanceof z.ZodError) {
      logger.warn({ error: e.errors }, 'Invalid request parameters');
      res.status(400).json({ ok: false, error: 'Invalid request parameters', details: e.errors });
      return;
    }

    logger.error({ e }, 'Error updating novelty score config');
    res.status(500).json({ ok: false, error: 'Internal server error' });
    return;
  }
};

export const updateNoveltyScoreConfigPath: ZodOpenApiPathsObject = {
  '/v1/nodes/{uuid}/noveltyScoreConfig': {
    put: {
      summary: 'Update Novelty Score UI Configuration',
      description: 'Updates the visibility settings for content and context novelty scores for a specific node.',
      tags: ['Nodes'],
      requestParams: {
        path: z.object({ uuid: z.string().openapi({ description: 'The UUID of the node.' }) }),
      },
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateNoveltyScoreConfigRequestBodySchema,
          },
        },
      },
      responses: {
        '200': {
          description: 'Novelty score configuration updated successfully.',
          content: {
            'application/json': {
              schema: SuccessResponseSchema,
            },
          },
        },
        '400': {
          description: 'Invalid request parameters.',
          content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        '403': {
          description: 'Unauthorized access.',
          content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        '404': {
          description: 'Node not found.',
          content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        '500': {
          description: 'Internal server error.',
          content: { 'application/json': { schema: ErrorResponseSchema } },
        },
      },
    } as ZodOpenApiOperationObject,
  },
};
