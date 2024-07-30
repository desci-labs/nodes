import { Request, Response } from 'express';

import { elasticClient } from '../../elasticSearchClient.js';
import { logger as parentLogger } from '../../logger.js';
import {
  buildBoolQuery,
  buildMultiMatchQuery,
  buildSortQuery,
  VALID_ENTITIES,
} from '../../services/ElasticSearchService.js';

import { QueryDebuggingResponse, SingleQueryErrorResponse, SingleQuerySuccessResponse } from './query.js';

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
  res: Response<(SingleQuerySuccessResponse & QueryDebuggingResponse) | SingleQueryErrorResponse>,
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

  const hardcodedMultiIndex = 'denormalized_works_test2';

  const esQueries = validEntityQueries.map((q) => {
    const [entity, query] = Object.entries(q)[0];
    return buildMultiMatchQuery(query, entity);
  });
  const primaryEntity = Object.keys(validEntityQueries[0])[0];
  const esSort = buildSortQuery(hardcodedMultiIndex, sortType, sortOrder);
  const esBoolQuery = buildBoolQuery(esQueries);

  try {
    logger.debug({ esQueries, esSort }, 'Executing query');
    const { hits } = await elasticClient.search({
      index: hardcodedMultiIndex,
      body: {
        ...esBoolQuery,
        sort: esSort,
        from: (page - 1) * perPage,
        size: perPage,
      },
    });
    debugger; //
    logger.info({ fn: 'Elastic search multi query executed successfully' });

    return res.json({
      esQueries,
      ok: true,
      total: hits.total,
      page,
      perPage,
      data: hits.hits,
    });
  } catch (error) {
    logger.error({ error }, 'Elastic search multi query failed');
    return res.status(500).json({
      ok: false,
      error: 'An error occurred while searching',
    });
  }
};
