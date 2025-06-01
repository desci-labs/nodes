import { Request, Response } from 'express';

import { elasticClient } from '../../elasticSearchClient.js';
import { logger, logger as parentLogger } from '../../logger.js';
import {
  buildBoolQuery,
  buildMultiMatchQuery,
  buildSortQuery,
  MAIN_WORKS_ALIAS,
  VALID_ENTITIES,
} from '../../services/ElasticSearchService.js';
import { getPublishersBySourceIds } from '../../services/OpenAlexService.js';

import { MIN_RELEVANCE_SCORE } from './query.js';
import { Entity, Filter, Query, QueryDebuggingResponse, QueryErrorResponse, QuerySuccessResponse } from './types.js';

type QueryObject = Record<Entity, Query>;

interface MultiQuerySearchParams {
  queries: QueryObject[];
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

export const multiQuery = async (
  req: Request<any, any, MultiQuerySearchParams>,
  res: Response<(QuerySuccessResponse & QueryDebuggingResponse) | QueryErrorResponse>,
) => {
  const {
    queries,
    fuzzy,
    filters,
    sort = { field: '_score', order: 'desc' },
    pagination = { page: 1, perPage: 10 },
  }: MultiQuerySearchParams = req.body;
  const logger = parentLogger.child({
    module: 'SEARCH::MultiQuery',
    queries,
    filters,
    fuzzy,
    sort,
    pagination,
  });

  logger.trace({ fn: 'Executing elastic search query' });

  const validEntityQueries = queries.filter((q) => VALID_ENTITIES.includes(Object.keys(q)[0]));
  if (!validEntityQueries) {
    return res.status(400).json({
      ok: false,
      error: `Invalid queries, the following entities are supported: ${VALID_ENTITIES.join(' ')}`,
    });
  }

  let primaryEntity = 'works'; // Hard coded for now to not affect results without a 'works' query.

  // const primaryEntity = Object.keys(validEntityQueries[0])[0];

  const esQueries = validEntityQueries.map((q) => {
    const [entity, query] = Object.entries(q)[0];
    let fullEntity = entity;
    if (entity !== primaryEntity) fullEntity = `${primaryEntity}_${entity}`; // e.g. if we're searching for authors in the works table, entity should be 'works_authors'
    return buildMultiMatchQuery(query, fullEntity, fuzzy);
  });

  const esSort = buildSortQuery(primaryEntity, sort.field, sort.order);
  const esBoolQuery = buildBoolQuery(esQueries, filters);

  const searchTermIsNonEmpty = Object.values(queries).some((q) => q['works']?.length > 0);

  // if search term is empty and there is no other sorting, then sort by content novelty and date
  if (sort.field === 'relevance') {
    esSort.push({
      content_novelty_percentile: { order: 'desc', missing: '_last' },
    });
    // esSort.push({ publication_year: { order: 'desc' } });
  }

  if (primaryEntity === 'works') {
    primaryEntity = MAIN_WORKS_ALIAS;
  }

  const finalQuery = {
    index: primaryEntity,
    body: {
      ...esBoolQuery,
      sort: esSort,
      from: (pagination.page - 1) * pagination.perPage,
      size: pagination.perPage,
      ...(searchTermIsNonEmpty ? { min_score: MIN_RELEVANCE_SCORE } : {}),
    },
  };

  try {
    logger.debug({ query: finalQuery }, 'Executing query');
    const startTime = Date.now();
    const { hits } = await elasticClient.search(finalQuery);
    const duration = Date.now() - startTime;

    const hitsDecorated = await decorateWithPublisherInfo(hits.hits);

    logger.info({ fn: 'Elastic search multi query executed successfully' });
    return res.json({
      finalQuery,
      index: primaryEntity,
      ok: true,
      total: hits.total,
      page: pagination.page,
      perPage: pagination.perPage,
      data: hitsDecorated,
      duration,
    });
  } catch (error) {
    logger.error({ error }, 'Elastic search multi query failed');
    return res.status(500).json({
      finalQuery,
      ok: false,
      error: 'An error occurred while searching',
    });
  }
};

const decorateWithPublisherInfo = async (hits: any[]) => {
  let results = [];
  try {
    const sourceIds = hits.map((hit) => hit._source.locations[0]?.source_id).filter(Boolean);
    logger.trace({ sourceIds }, 'sourceIds');
    const publishers = await getPublishersBySourceIds(sourceIds);
    logger.trace({ sourceIds, publishers }, 'publishers');

    results = hits.map((hit) => {
      const sourceId = hit._source.locations[0]?.source_id;
      if (!sourceId) {
        return hit;
      }
      const sourceDisplayName = cleanCorruptedText(publishers[sourceId]);

      hit._source.locations[0].source_display_name = sourceDisplayName;

      return {
        ...hit,
        sourceDisplayName,
      };
    });
  } catch (error) {
    logger.error({ error }, 'Error decorating with publisher info');
    return hits;
  }
  return results;
};

export function cleanCorruptedText(text: string) {
  return text
    .replace(/[\u0098\u009C]/g, '') // remove corrupt control characters
    .normalize('NFKC') // normalize quotes, ligatures, etc.
    .trim();
}
