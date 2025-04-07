import 'zod-openapi/extend';
import { User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import z from 'zod';

import { prisma } from '../../client.js';
import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { getFromCache, setToCache } from '../../redisClient.js';
import { openAlexService } from '../../services/index.js';
import { WorksResult } from '../../services/openAlex/client.js';
import { OpenAlexAuthor, OpenAlexWork } from '../../services/openAlex/types.js';
import { cachedGetManifestAndDpid } from '../../utils/manifest.js';
import { asyncMap } from '../../utils.js';
import { listAllUserNodes, PublishedNode } from '../nodes/list.js';

export const getAuthorSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Missing ORCID ID' }).describe('The ORCID identifier of the author'),
  }),
});

export const getAuthorWorksSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Missing ORCID ID' }).describe('The ORCID identifier of the author'),
  }),
  query: z.object({
    page: z.coerce.number().optional().default(1).describe('Page number for pagination of author works'),
    limit: z.coerce.number().optional().default(200).describe('Number of works to return per page'),
  }),
});

const PROFILE_CACHE_PREFIX = 'OPENALEX_AUTHOR_';
const WORKS_CACHE_PREFIX = 'OPENALEX_WORKS_';

export const getAuthorProfile = async (req: Request, res: Response, next: NextFunction) => {
  const { params } = await getAuthorSchema.parseAsync(req);

  let openalexProfile = await getFromCache(`${PROFILE_CACHE_PREFIX}-${params.id}`);
  if (!openalexProfile) {
    openalexProfile = await openAlexService.searchAuthorByOrcid(params.id);
    // logger.trace({ openalexProfile }, 'openalexProfile');
  }

  if (openalexProfile) setToCache(`${PROFILE_CACHE_PREFIX}-${params.id}`, openalexProfile);

  return new SuccessResponse(openalexProfile).send(res);
};

export const getAuthorWorks = async (req: Request, res: Response, next: NextFunction) => {
  const { query, params } = await getAuthorWorksSchema.parseAsync(req);
  const limit = 20;

  let openalexProfile = await getFromCache<OpenAlexAuthor>(`${PROFILE_CACHE_PREFIX}-${params.id}-${query.page}`);
  if (!openalexProfile) {
    openalexProfile = await openAlexService.searchAuthorByOrcid(params.id);
    logger.trace({ openalexProfile: openalexProfile.id }, 'openalexProfile');
    if (openalexProfile) setToCache(`${PROFILE_CACHE_PREFIX}-${params.id}`, openalexProfile);
  }

  // TODO: Change to openAlex author ID
  let openalexWorks = await getFromCache<WorksResult>(`${WORKS_CACHE_PREFIX}-${params.id}`);
  if (!openalexWorks) {
    openalexWorks = await openAlexService.searchWorksByOpenAlexId(openalexProfile.id, {
      page: query.page,
      perPage: query.limit,
    });

    if (openalexProfile) setToCache(`${WORKS_CACHE_PREFIX}-${params.id}-${openalexWorks.meta.page}`, openalexWorks);
  }

  new SuccessResponse({ meta: { ...query }, works: openalexWorks.works }).send(res);
};

const logger = parentLogger.child({
  module: 'NODE::getPublishedNodes',
});

export const getAuthorNodesSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Missing ORCID ID' }).describe('The ORCID identifier of the author'),
  }),
  query: z.object({
    g: z.string().optional().describe('Optional ipfs gateway provider link'),
    page: z.coerce.number().optional().default(1).describe('Page number for pagination of author works'),
    limit: z.coerce.number().optional().default(20).describe('Number of works to return per page'),
  }),
});

type PublishedNodesQueryParams = {
  /** Alternative IPFS gateway */
  g?: string;
  page?: string;
  size?: string;
};

// User populated by auth middleware
type PublishedNodesRequest = Request<never, never, never, PublishedNodesQueryParams> & { user: User };

type PublishedNodesResponse = Response<{
  nodes: PublishedNode[];
}>;

export const getAuthorPublishedNodes = async (req: PublishedNodesRequest, res: PublishedNodesResponse) => {
  const { data } = getAuthorNodesSchema.safeParse(req);
  const { params, query } = data;
  const { id } = params;
  const { page, limit: size, g: gateway = '' } = query;
  const owner = await prisma.user.findFirst({ where: { orcid: id }, select: { id: true } });

  logger.info(
    {
      params,
      query,
    },
    'getting published nodes',
  );
  if (!owner) return new SuccessResponse({ nodes: [], meta: { page, limit: size, g: gateway } }).send(res);

  const nodes = await listAllUserNodes(owner.id, page, size, true);
  const publishedNodes = nodes.filter((n) => n.versions.length);

  const formattedNodes = await asyncMap(publishedNodes, async (n) => {
    const versionIx = n.versions.length - 1;
    const cid = n.versions[0].manifestUrl;
    let dpid = n.dpidAlias;
    let title = n.title;
    const cachedResult = await cachedGetManifestAndDpid(cid, gateway);
    title = cachedResult?.manifest?.title ?? title;
    if (!n.dpidAlias) {
      dpid = cachedResult?.dpid;
    }
    const publishedAt = n.versions[0].createdAt;

    return {
      dpid,
      title,
      versionIx,
      publishedAt,
      createdAt: n.createdAt,
      isPublished: true as const,
      uuid: n.uuid.replace('.', ''),
    };
  });

  return new SuccessResponse({ meta: { page, limit: size, g: gateway }, nodes: formattedNodes }).send(res);
};
