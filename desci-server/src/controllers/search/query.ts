import { Request, Response } from 'express';

import { elasticClient } from '../../elasticSearchClient.js';
import { logger as parentLogger } from '../../logger.js';

interface QuerySearchParams {
  query: string;
  entity: string;
  fuzzy?: number;
  sortType?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
}

export const VALID_ENTITIES = ['authors', 'concepts', 'institutions', 'publishers', 'sources', 'topics', 'works'];

export const singleQuery = async (req: Request, res: Response) => {
  const {
    query,
    entity,
    fuzzy,
    sortType = 'relevance',
    sortOrder,
    page = 1,
    perPage = 10,
  }: QuerySearchParams = req.body;
  const logger = parentLogger.child({
    module: 'SEARCH::Query',
    query,
    entity,
    fuzzy,
    sortType,
    sortOrder,
    page,
    perPage,
  });

  logger.trace({ fn: 'Executing elastic search query' });

  if (!VALID_ENTITIES.includes(entity)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid entity: ${entity}, qthe following entities are supported: ${VALID_ENTITIES.join(' ')}`,
    });
  }

  const esQuery = buildElasticSearchQuery(query, entity, fuzzy);
  const esSort = buildSortQuery(sortType, sortOrder);

  try {
    debugger;
    logger.debug({ esQuery, esSort }, 'Executing query');
    const resp = await elasticClient.search({
      index: entity,
      body: {
        query: esQuery,
        sort: esSort,
        from: (page - 1) * perPage,
        size: perPage,
      },
    });
    debugger;
    logger.info({ fn: 'Elastic search query executed successfully' });
    return res.status(200).send(resp);

    //     res.json({
    //       ok: true,
    //       data: hits.hits,
    //       total: hits.total.value,
    //       page,
    //       perPage,
    //     });
  } catch (error) {
    logger.error({ fn: 'Elastic search query failed', error });
    return res.status(500).json({
      ok: false,
      error: 'An error occurred while searching',
    });
  }
};

function buildElasticSearchQuery(query: string, entity: string, fuzzy: number) {
  return {
    query_string: {
      query: `${entity} AND (${query})`,
      // [entity]: {
      //   query: query,
      // },
    },
  };
}

function buildSortQuery(sortType: string, sortOrder?: string) {
  const order = sortOrder === 'asc' ? 'asc' : 'desc';
  switch (sortType) {
    case 'date':
      return [{ year: order }];
    case 'relevance':
    default:
      return ['_score'];
  }
}
