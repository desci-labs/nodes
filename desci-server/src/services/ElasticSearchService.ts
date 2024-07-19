export const VALID_ENTITIES = ['authors', 'concepts', 'institutions', 'publishers', 'sources', 'topics', 'works'];

/**
 * Ordered from most relevant to least relevant
 */
export const RELEVANT_FIELDS = {
  works: ['title', 'abstract', 'doi'],
  authors: ['display_name', 'orcid'],
};
// abstract_inverted_index

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

export function buildMultiMatchQuery(query: string, entity: string, fuzzy?: number) {
  let fields = [];
  if (entity === 'works') fields = RELEVANT_FIELDS.works;
  if (entity === 'authors') fields = RELEVANT_FIELDS.works;
  return {
    multi_match: {
      query: query,
      fields: fields,
      type: 'best_fields',
      fuzziness: fuzzy || 'AUTO',
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

export type IndexedAuthor = {
  _index: string;
  _id: string;
  _score: number;
  _source: {
    works_count: number;
    display_name: string;
    cited_by_count: number;
    works_api_url: string;
    orcid: string | null;
    id: string;
    last_known_institution: any | null;
    '@timestamp': string;
    '@version': string;
    updated_date: string;
  };
};
