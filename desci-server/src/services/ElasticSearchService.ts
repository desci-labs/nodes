export const VALID_ENTITIES = ['authors', 'concepts', 'institutions', 'publishers', 'sources', 'topics', 'works'];

export function buildSimpleStringQuery(query: string, entity: string, fuzzy?: number) {
  return {
    simple_query_string: {
      query: query,
      // [entity]: {
      //   query: query,
      // },
    },
  };
}

export function buildBoolQuery(queries: any[]) {
  return {
    query: {
      bool: {
        // must: [],
        should: queries,
        // filter: [],
      },
    },
  };
}

export function buildSortQuery(sortType: string, sortOrder?: string) {
  const order = sortOrder === 'asc' ? 'asc' : 'desc';
  switch (sortType) {
    case 'date':
      return [{ year: order }];
    case 'relevance':
    default:
      return ['_score'];
  }
}
