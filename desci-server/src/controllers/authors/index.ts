import { Request, Response, NextFunction } from 'express';
import z from 'zod';

import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger } from '../../logger.js';
import { getFromCache, setToCache } from '../../redisClient.js';
import { openAlexService } from '../../services/index.js';
import { WorksResult } from '../../services/openAlex/client.js';
import { OpenAlexAuthor, OpenAlexWork } from '../../services/openAlex/types.js';

export const getAuthorSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Missing ORCID ID' }),
  }),
});

export const getAuthorWorksSchema = z.object({
  params: z.object({
    id: z.string({ required_error: 'Missing ORCID ID' }),
  }),
  query: z.object({
    page: z.coerce.number().optional().default(1),
    limit: z.coerce.number().optional().default(200),
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

  // if (openalexProfile) setToCache(`${PROFILE_CACHE_PREFIX}-${params.id}`, openalexProfile);

  return new SuccessResponse(openalexProfile).send(res);
};

export const getAuthorWorks = async (req: Request, res: Response, next: NextFunction) => {
  const { query, params } = await getAuthorWorksSchema.parseAsync(req);
  const limit = 20;
  //  const page = Math.max(Math.max((query.page ?? 0) - 1, 0), 0);
  // const offset = limit * page;

  let openalexProfile = await getFromCache<OpenAlexAuthor>(`${PROFILE_CACHE_PREFIX}-${params.id}-${query.page}`);
  if (!openalexProfile) {
    openalexProfile = await openAlexService.searchAuthorByOrcid(params.id);
    logger.trace({ openalexProfile: openalexProfile.id }, 'openalexProfile');
    // if (openalexProfile) setToCache(`${PROFILE_CACHE_PREFIX}-${params.id}`, openalexProfile);
  }

  // TODO: Change to openAlex author ID
  let openalexWorks = await getFromCache<WorksResult>(`${WORKS_CACHE_PREFIX}-${params.id}`);
  if (!openalexWorks) {
    openalexWorks = await openAlexService.searchWorksByOpenAlexId(openalexProfile.id, {
      page: query.page,
      perPage: query.limit,
    });
    logger.trace({ openalexWorks }, 'openalexWorks');

    // TODO: Change to openAlex author ID
    // if (openalexProfile) setToCache(`${WORKS_CACHE_PREFIX}-${params.id}-${openalexWorks.meta.page}`, openalexWorks);
  }

  return new SuccessResponse({ meta: { ...query }, works: openalexWorks.works }).send(res);
};
