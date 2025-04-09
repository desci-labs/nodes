import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { InternalError } from '../../core/ApiError.js';
import { SuccessResponse } from '../../core/ApiResponse.js';
import { elasticClient } from '../../elasticSearchClient.js';
import { logger as parentLogger } from '../../logger.js';
import { getFromCache, setToCache } from '../../redisClient.js';
import {
  buildBoolQuery,
  buildMultiMatchQuery,
  buildSortQuery,
  getLocallyPublishedWorks,
  getWorkByDpid,
  MAIN_WORKS_ALIAS,
  NATIVE_WORKS_INDEX,
  NativeWork,
  VALID_ENTITIES,
} from '../../services/ElasticSearchService.js';
import { asyncMap } from '../../utils.js';

import { Filter, QueryErrorResponse, QuerySuccessResponse } from './types.js';

export const MIN_RELEVANCE_SCORE = 0.01;
interface SingleQuerySearchBodyParams {
  query: string;
  entity: string;
  filters?: Filter[];
  fuzzy?: number;
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
  pagination?: {
    page: number;
    perPage: number;
  };
}

export const singleQuery = async (
  req: Request<any, any, SingleQuerySearchBodyParams>,
  res: Response<QuerySuccessResponse | QueryErrorResponse>,
) => {
  const {
    query,
    filters = [],
    entity,
    fuzzy,
    sort = { field: '_score', order: 'desc' },
    pagination = { page: 1, perPage: 10 },
  }: SingleQuerySearchBodyParams = req.body;
  //
  const logger = parentLogger.child({
    module: 'SEARCH::SingleQuery',
    query,
    entity,
    filters,
    fuzzy,
    sort,
    pagination,
  });

  logger.trace({ fn: 'Executing elastic search query' });

  if (!VALID_ENTITIES.includes(entity)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid entity: ${entity}, the following entities are supported: ${VALID_ENTITIES.join(' ')}`,
    });
  }
  //

  // const esQuery = buildSimpleStringQuery(query, entity, fuzzy);
  const esQuery = buildMultiMatchQuery(query, entity, fuzzy);
  const esBoolQuery = buildBoolQuery([esQuery], filters);

  const esSort = buildSortQuery(entity, sort.field, sort.order);

  let searchEntity = entity;

  if (entity === 'works') {
    searchEntity = MAIN_WORKS_ALIAS;
  }

  if (entity === 'fields') {
    searchEntity = 'subfields'; // Overwrite as fields are accessible via 'subfields' index
    logger.info(
      { entity, searchEntity },
      `Entity provided is '${entity}', overwriting with '${searchEntity}' because ${entity} is accessible in that index.`,
    );
  }

  if (entity === 'authors') {
    searchEntity = 'authors_with_institutions'; // Overwrite as fields are accessible via 'subfields' index
    logger.info(
      { entity, searchEntity },
      `Entity provided is '${entity}', overwriting with '${searchEntity}' because its a more complete index containing institution data`,
    );
  }
  const finalQuery = {
    index: searchEntity,
    body: {
      ...esBoolQuery,
      sort: esSort,
      from: (pagination.page - 1) * pagination.perPage,
      size: pagination.perPage,
      min_score: MIN_RELEVANCE_SCORE,
    },
  };

  logger.debug({ query: finalQuery }, 'Executing query');

  try {
    const startTime = Date.now();
    const results = await elasticClient.search(finalQuery);
    const duration = Date.now() - startTime;
    const hits = results.hits;
    logger.info({ hitsReturned: hits.total }, 'Elastic search query executed successfully');

    return res.json({
      finalQuery,
      ok: true,
      index: searchEntity,
      total: hits.total,
      page: pagination.page,
      perPage: pagination.perPage,
      data: hits.hits,
      duration,
    });
  } catch (error) {
    logger.error({ error }, 'Elastic search query failed');
    return res.status(500).json({
      ok: false,
      error: 'An error occurred while searching',
      finalQuery,
    });
  }
};

const DPID_QUERY_CACHE_KEY = 'DPID_QUERY_CACHE_KEY-';
export const dpidQuery = async (
  req: Request<any, any, SingleQuerySearchBodyParams>,
  res: Response<QuerySuccessResponse | QueryErrorResponse>,
) => {
  const {
    // query,
    // filters = [],
    // entity,
    // fuzzy,
    // sort = { field: '_score', order: 'desc' },
    pagination = { page: 1, perPage: 20 },
  }: SingleQuerySearchBodyParams = req.body;

  const logger = parentLogger.child({
    module: 'SEARCH::SingleQuery',
    // query,
    // filters,
    // fuzzy,
    // sort,
    pagination,
  });

  logger.trace({ fn: 'Executing elastic search query' });

  const finalQuery = {
    from: (pagination.page - 1) * pagination.perPage,
    size: pagination.perPage,
  };

  logger.debug({ query: finalQuery }, 'Executing query');

  try {
    const startTime = Date.now();
    const cacheKey = `${DPID_QUERY_CACHE_KEY}-${pagination.page}`;
    let hits = await getFromCache<(NativeWork & { versionIdx: number })[]>(cacheKey);
    let duration = Date.now() - startTime;

    logger.trace({ fromCache: !!hits }, 'CACHE LOOKUP');
    if (!hits) {
      const results = await getLocallyPublishedWorks(finalQuery);

      hits = await asyncMap(results, async (hit) => {
        const data = hit._source;
        const uuid = data.work_id.replace('node/', '');

        let dpid = data.dpid;
        if (process.env.SERVER_URL === 'http://localhost:5420' && process.env.ELASTIC_SEARCH_LOCAL_DEV_DPID_NAMESPACE) {
          dpid = dpid.replace(process.env.ELASTIC_SEARCH_LOCAL_DEV_DPID_NAMESPACE, '');
        }

        const node = await prisma.node.findFirst({
          select: {
            createdAt: true,
            versions: {
              select: {
                manifestUrl: true,
                createdAt: true,
                commitId: true,
                transactionId: true,
              },
              where: {
                OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          where: {
            uuid,
            isDeleted: false,
          },
        });
        const versionIdx = node ? node?.versions?.length - 1 : null;

        return {
          ...data,
          uuid,
          dpid,
          versionIdx,
        };
      });

      duration = Date.now() - startTime;

      await setToCache(cacheKey, hits);
    }
    logger.trace({ hits: !!hits }, 'Elastic search query executed successfully');
    return new SuccessResponse({
      finalQuery,
      index: NATIVE_WORKS_INDEX,
      total: hits?.length ?? 0,
      from: pagination.page,
      size: pagination.perPage,
      data: hits ?? [],
      duration,
    }).send(res);
  } catch (error) {
    logger.error({ error }, 'Elastic search query failed');
    throw new InternalError('An error occurred while searching');
    // return res.status(500).json({
    //   ok: false,
    //   error: 'An error occurred while searching',
    //   finalQuery,
    // });
  }
};

export const singleDpidQuery = async (
  req: Request<any, any, SingleQuerySearchBodyParams>,
  res: Response<QuerySuccessResponse | QueryErrorResponse>,
) => {
  const {
    query,
    filters = [],
    // entity,
    fuzzy,
    sort = { field: '_score', order: 'desc' },
    pagination = { page: 1, perPage: 20 },
  }: SingleQuerySearchBodyParams = req.body;

  const { dpid } = req.params;
  const logger = parentLogger.child({
    module: 'SEARCH::SingleQuery',
    dpid,
    query,
    filters,
    fuzzy,
    sort,
    pagination,
  });

  logger.trace({ fn: 'Executing elastic search query' });

  const finalQuery = {
    index: NATIVE_WORKS_INDEX,
    body: {
      query: {
        term: {
          dpid: dpid,
        },
      },
      size: 1,
    },
  };

  logger.debug({ dpid }, 'Executing query');

  try {
    const startTime = Date.now();
    const results = await getWorkByDpid(dpid);
    const duration = Date.now() - startTime;
    const hits = results?.map((hit) => hit._source);
    new SuccessResponse({
      finalQuery,
      ok: true,
      index: NATIVE_WORKS_INDEX,
      data: hits?.[0],
      duration,
    }).send(res);
  } catch (error) {
    logger.error({ error }, 'Elastic search query failed');
    throw new InternalError('An error occurred while searching');
  }
};
