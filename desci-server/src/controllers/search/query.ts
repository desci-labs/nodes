import { Request, Response } from 'express';

import { elasticClient } from '../../elasticSearchClient.js';
import { logger as parentLogger } from '../../logger.js';
import {
  buildBoolQuery,
  buildMultiMatchQuery,
  buildSortQuery,
  VALID_ENTITIES,
} from '../../services/ElasticSearchService.js';

import { Filter, QueryErrorResponse, QuerySuccessResponse } from './types.js';

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

  // const esQuery = buildSimpleStringQuery(query, entity, fuzzy);
  const tempEntity = entity === 'works' ? 'works_single' : entity; // Temp to apply boosting algo to default search
  const esQuery = buildMultiMatchQuery(query, tempEntity, fuzzy);
  const esBoolQuery = buildBoolQuery([esQuery], filters);
  const esSort = buildSortQuery(entity, sort.field, sort.order);

  try {
    logger.debug({ esQuery, esSort, esBoolQuery }, 'Executing query');
    const searchEntity = entity; // logic not removed to handle other rewrites here
    // const searchEntity = entity === 'works' ? DENORMALIZED_WORKS_INDEX : entity; // Temp overwrite with denormalized works index
    // if (entity === 'works')
    //   logger.info({ entity }, `Entity is 'works', changing to denormalized works index: ${DENORMALIZED_WORKS_INDEX}`);

    const results = await elasticClient.search({
      index: searchEntity,
      body: {
        ...esBoolQuery,
        sort: esSort,
        from: (pagination.page - 1) * pagination.perPage,
        size: pagination.perPage,
      },
    });
    const hits = results.hits;
    logger.info({ hitsReturned: hits.total }, 'Elastic search query executed successfully');

    return res.json({
      esQuery,
      esSort,
      esBoolQuery,
      ok: true,
      total: hits.total,
      page: pagination.page,
      perPage: pagination.perPage,
      data: hits.hits,
    });
  } catch (error) {
    logger.error({ error }, 'Elastic search query failed');
    return res.status(500).json({
      ok: false,
      error: 'An error occurred while searching',
      esQuery,
      esSort,
      esBoolQuery,
    });
  }
};
