import 'zod-openapi/extend';
import { User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import z from 'zod';

import { prisma } from '../../client.js';
import { InternalErrorResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { delFromCache, getFromCache, ONE_WEEK_TTL, setToCache } from '../../redisClient.js';
import { crossRefClient, openAlexService } from '../../services/index.js';
import { WorksResult } from '../../services/openAlex/client.js';
import { OpenAlexAuthor, OpenAlexWork } from '../../services/openAlex/types.js';
import {
  CoAuthor,
  computeAuthorIndices,
  getUniqueCoauthors,
  queryIndicesFeats,
} from '../../services/OpenAlexService.js';
import { cachedGetManifestAndDpid } from '../../utils/manifest.js';
import { asyncMap, formatOrcidString } from '../../utils.js';
import { listAllUserNodes, PublishedNode } from '../nodes/list.js';

import { transformOrcidAffiliationToEducation, transformOrcidAffiliationToEmployment } from './transformer.js';
import { Author, AuthorExperience } from './types.js';

export const getAuthorSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: 'Missing ORCID or OpenAlex ID' })
      .describe('The ORCID or OpenAlex identifier of the author'),
  }),
});

export const getCoauthorSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: 'Missing ORCID or OpenAlex ID' })
      .describe('The ORCID or OpenAlex identifier of the author'),
  }),
  query: z.object({
    page: z.coerce.string().optional().default('1').describe('Page number for pagination of returned list'),
    limit: z.coerce.string().optional().default('50').describe('Number of entries to return per page'),
    search: z.string().optional().describe('filter results by name'),
  }),
});

export const getAuthorWorksSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Missing ORCID or OpenAlex ID' }).describe('The ORCID identifier of the author'),
  }),
  query: z.object({
    page: z.coerce.number().optional().default(1).describe('Page number for pagination of author works'),
    limit: z.coerce.number().optional().default(200).describe('Number of works to return per page'),
  }),
});

const PROFILE_CACHE_PREFIX = 'OPENALEX_AUTHOR';
const WORKS_CACHE_PREFIX = 'OPENALEX_WORKS';
const COAUTHOR_CACHE_PREFIX = 'COAUTHOR';
const AUTHOR_INDICES_CACHE_PREFIX = 'AUTHOR_INDICES';
const AUTHOR_EXPERIENCE_CACHE_PREFIX = 'AUTHOR_EXPERIENCE';

const OPENALEX_ID_REGEX = /^(?:https:\/\/openalex\.org\/)?A\d+$/;
const ORCID_REGEX = /^(?:https:\/\/orcid\.org\/)?\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

async function getAuthorExperience(orcid: string) {
  let experience: { education: AuthorExperience[]; employment: AuthorExperience[] } = await getFromCache(
    `${AUTHOR_EXPERIENCE_CACHE_PREFIX}-${orcid}`,
  );

  if (!experience) {
    const { educationHistory, employmentHistory } = await crossRefClient.getProfileExperience(orcid);

    const [education, employment] = await Promise.all([
      transformOrcidAffiliationToEducation(educationHistory),
      transformOrcidAffiliationToEmployment(employmentHistory),
    ]);

    experience = { education, employment };

    // update cache
    setToCache(`${AUTHOR_EXPERIENCE_CACHE_PREFIX}-${orcid}`, experience);
  }

  return experience;
}

async function getBibliometrics(id: string) {
  let bibliometrics = await getFromCache<ReturnType<typeof computeAuthorIndices>>(
    `${AUTHOR_INDICES_CACHE_PREFIX}-${id}`,
  );
  if (!bibliometrics) {
    const authorIndices = await queryIndicesFeats([id], new Date().getFullYear());
    bibliometrics = computeAuthorIndices(authorIndices, id, new Date().getFullYear(), 1, 4);

    // update cache
    setToCache(`${AUTHOR_INDICES_CACHE_PREFIX}-${id}`, bibliometrics, ONE_WEEK_TTL);
  }

  return bibliometrics;
}

export const getAuthorProfile = async (req: Request, res: Response, next: NextFunction) => {
  const { params } = await getAuthorSchema.parseAsync(req);

  const isOpenAlexId = OPENALEX_ID_REGEX.test(params.id);
  const isOrcidId = ORCID_REGEX.test(params.id);

  let openalexProfile = await getFromCache<OpenAlexAuthor>(`${PROFILE_CACHE_PREFIX}-${params.id}`);
  if (!openalexProfile) {
    openalexProfile = isOrcidId
      ? await openAlexService.searchAuthorByOrcid(params.id)
      : isOpenAlexId
        ? await openAlexService.searchAuthorByOpenAlexId(params.id)
        : null;
    logger.trace({ openalexProfile: !!openalexProfile, isOrcidId }, 'openalexProfile');
  }

  let profile: Author = openalexProfile;

  const [experience, bibliometrics] = await Promise.all([
    getAuthorExperience(openalexProfile?.orcid ?? ''),
    getBibliometrics(openalexProfile.id),
  ]);

  if (openalexProfile) setToCache(`${PROFILE_CACHE_PREFIX}-${params.id}`, profile);

  return new SuccessResponse({ bibliometrics, ...profile, ...experience }).send(res);
};

export const getCoAuthors = async (req: Request, res: Response, next: NextFunction) => {
  const {
    params,
    query: { page, limit, search },
  } = await getCoauthorSchema.parseAsync(req);

  const isOpenAlexId = OPENALEX_ID_REGEX.test(params.id);
  const isOrcidId = ORCID_REGEX.test(params.id);

  const start = Date.now();

  let openalexProfile = await getFromCache<OpenAlexAuthor>(`${PROFILE_CACHE_PREFIX}-${params.id}`);
  if (!openalexProfile) {
    openalexProfile = isOrcidId
      ? await openAlexService.searchAuthorByOrcid(params.id)
      : isOpenAlexId
        ? await openAlexService.searchAuthorByOpenAlexId(params.id)
        : null;
    setToCache(`${PROFILE_CACHE_PREFIX}-${params.id}`, openalexProfile);
  }

  const coauthorsCacheKey = `${COAUTHOR_CACHE_PREFIX}-${openalexProfile?.id}-${page}-${limit}${search ? '-' + search : ''}`;
  let coauthors = await getFromCache<CoAuthor[]>(coauthorsCacheKey);

  try {
    if (!coauthors && openalexProfile) {
      coauthors = await getUniqueCoauthors(
        [openalexProfile.id],
        new Date().getFullYear(),
        search,
        (parseInt(page) - 1) * parseInt(limit),
        parseInt(limit),
      );

      if (coauthors) setToCache(coauthorsCacheKey, coauthors);
    }
  } catch (err) {
    logger.error({ err }, 'Request to OPEN_ALEX_DATABASE Failed');
    return new InternalErrorResponse(
      "Endpoint is currently down, we're currently working on getting it back up asap",
    ).send(res);
  }

  const end = Date.now();
  return new SuccessResponse({
    meta: {
      page,
      limit,
      duration: end - start,
      count: coauthors?.length ?? 0,
      nextPage: coauthors?.length == parseInt(limit) ? parseInt(page) + 1 : null,
    },
    results: coauthors,
  }).send(res);
};

export const getAuthorWorks = async (req: Request, res: Response, next: NextFunction) => {
  const { query, params } = await getAuthorWorksSchema.parseAsync(req);
  const limit = 20;

  const isOpenAlexId = OPENALEX_ID_REGEX.test(params.id);
  const isOrcidId = ORCID_REGEX.test(params.id);

  logger.trace({ isOpenAlexId, isOrcidId, id: params.id }, 'ID TYPE');
  let openalexProfile = await getFromCache<OpenAlexAuthor>(`${PROFILE_CACHE_PREFIX}-${params.id}`);
  if (!openalexProfile) {
    openalexProfile = isOrcidId
      ? await openAlexService.searchAuthorByOrcid(params.id)
      : isOpenAlexId
        ? await openAlexService.searchAuthorByOpenAlexId(params.id)
        : null;
    logger.trace({ openalexProfile: openalexProfile?.id }, 'openalexProfile');
    if (openalexProfile) setToCache(`${PROFILE_CACHE_PREFIX}-${params.id}`, openalexProfile);
  }

  let openalexWorks = await getFromCache<WorksResult>(`${WORKS_CACHE_PREFIX}-${params.id}-${query.page}`);
  if (!openalexWorks && openalexProfile?.id) {
    openalexWorks = await openAlexService.searchWorksByOpenAlexId(openalexProfile.id, {
      page: query.page,
      perPage: query.limit,
    });

    if (openalexWorks) setToCache(`${WORKS_CACHE_PREFIX}-${params.id}-${query.page}`, openalexWorks);
  }

  new SuccessResponse({ meta: { ...query }, works: openalexWorks?.works ?? [] }).send(res);
};

const logger = parentLogger.child({
  module: 'NODE::getPublishedNodes',
});

export const getAuthorNodesSchema = z.object({
  params: z.object({
    orcid: z.string({ required_error: 'Missing ORCID ID' }).describe('The ORCID identifier of the author'),
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
  const { orcid } = params;
  const { page, limit: size, g: gateway = '' } = query;
  const id = formatOrcidString(orcid);
  logger.trace({ id, orcid }, 'ORCID');
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
      authors: cachedResult?.manifest?.authors,
      createdAt: n.createdAt,
      uuid: n.uuid.replace('.', ''),
    };
  });

  return new SuccessResponse({ meta: { page, limit: size, g: gateway }, nodes: formattedNodes }).send(res);
};
