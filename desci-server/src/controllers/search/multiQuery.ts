import { Request, Response } from 'express';

import { elasticClient } from '../../elasticSearchClient.js';
import { logger as parentLogger } from '../../logger.js';
import {
  buildBoolQuery,
  buildSimpleStringQuery,
  buildSortQuery,
  VALID_ENTITIES,
} from '../../services/ElasticSearchService.js';

import { SingleQueryErrorResponse, SingleQuerySuccessResponse } from './query.js';

type Entity = string;
type Query = string;

type QueryObject = Record<Entity, Query>;

interface MultiQuerySearchParams {
  queries: QueryObject[];
  fuzzy?: number;
  sortType?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
}

export const multiQuery = async (
  req: Request<any, any, MultiQuerySearchParams>,
  res: Response<SingleQuerySuccessResponse | SingleQueryErrorResponse>,
) => {
  const {
    queries,
    fuzzy,
    sortType = 'relevance',
    sortOrder,
    page = 1,
    perPage = 10,
  }: MultiQuerySearchParams = req.body;
  const logger = parentLogger.child({
    module: 'SEARCH::MultiQuery',
    queries,
    fuzzy,
    sortType,
    sortOrder,
    page,
    perPage,
  });

  logger.trace({ fn: 'Executing elastic search query' });

  const validEntityQueries = queries.filter((q) => VALID_ENTITIES.includes(Object.keys(q)[0]));

  if (!validEntityQueries) {
    return res.status(400).json({
      ok: false,
      error: `Invalid queries, the following entities are supported: ${VALID_ENTITIES.join(' ')}`,
    });
  }

  const esQueries = validEntityQueries.map((q) => {
    return buildSimpleStringQuery(Object.values(q)[0], Object.keys(q)[0]);
  });
  const esSort = buildSortQuery(sortType, sortOrder);
  const esBoolQuery = buildBoolQuery(esQueries);

  try {
    debugger;
    logger.debug({ esQueries, esSort }, 'Executing query');
    const { hits } = await elasticClient.search({
      body: {
        ...esBoolQuery,
        sort: esSort,
        from: (page - 1) * perPage,
        size: perPage,
      },
    });
    debugger;
    logger.info({ fn: 'Elastic search multi query executed successfully' });

    return res.json({
      ok: true,
      total: hits.total,
      page,
      perPage,
      data: hits.hits,
    });
  } catch (error) {
    logger.error({ fn: 'Elastic search query failed', error });
    return res.status(500).json({
      ok: false,
      error: 'An error occurred while searching',
    });
  }
};
