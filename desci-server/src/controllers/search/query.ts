import { Request, Response } from 'express';

import { elasticClient } from '../../elasticSearchClient.js';
import { logger as parentLogger } from '../../logger.js';
import {
  buildBoolQuery,
  buildMultiMatchQuery,
  buildSortQuery,
  Filter,
  VALID_ENTITIES,
} from '../../services/ElasticSearchService.js';

import { QueryErrorResponse, QuerySuccessResponse } from './multiQuery.js';

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
    searchEntity = 'works_opt';
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
