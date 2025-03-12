import { logger } from './logger.js';
import type { Work } from './types/index.js';
import type { QueryInfo } from './db/index.js';
import { dropTime } from './util.js';

const OPEN_ALEX_API = 'https://api.openalex.org/';
const WORKS_URL = OPEN_ALEX_API + '/works';

type ApiResponse<T> = {
  meta: {
    count: number;
    db_response_time_ms: number;
    page: number;
    per_page: number;
    next_cursor: string | undefined;
    groups_count: number | null;
  };
  results: T;
};

export type Query = {
  filter?: FilterParam;
  'per-page'?: number;
  cursor: string | undefined;
  mailto?: string | undefined;
};

export type FilterParam = {
  from_publication_date?: string;
  to_publication_date?: string;
  from_created_date?: string;
  from_updated_date?: string;
  to_created_date?: string;
  to_updated_date?: string;
  has_ror?: boolean;
};

export const filterFromQueryInfo = (queryInfo: QueryInfo) => {
  const { query_type, query_from, query_to } = queryInfo;

  const formattedFromDate = query_from.toISOString().replace('Z', '');
  const formattedToDate = query_to.toISOString().replace('Z', '');

  const filter: FilterParam =
    query_type === 'created'
      ? { from_created_date: dropTime(formattedFromDate), to_created_date: dropTime(formattedToDate) }
      : { from_updated_date: formattedFromDate, to_updated_date: formattedToDate };

  return filter;
};

export const getInitialWorksQuery = (filter: FilterParam): Query => ({
  filter,
  'per-page': 200,
  cursor: '*',
  // https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication#the-polite-pool
  mailto: 'edvard@desci.com',
});

export const fetchWorksPage = (searchQuery: Query) => fetchPage<Work>(WORKS_URL, searchQuery);

export async function fetchPage<T>(
  url: string,
  searchQuery: Query,
): Promise<{ data: T[]; next_cursor: string | undefined }> {
  const query = buildQueryString(searchQuery);
  const request = new Request(`${url}?${query}`, {
    headers: { 'API-KEY': process.env.OPENALEX_API_KEY as string },
  });
  const response = (await fetch(request)) as Response;

  if (response.ok && response.status === 200) {
    if (response.headers.get('content-type')?.includes('application/json')) {
      const res = (await response.json()) as ApiResponse<T[]>;
      return {
        data: res.results as T[],
        next_cursor: res.meta.next_cursor,
      };
    } else {
      logger.error(response, 'Unexpected API response');
      throw new Error('Unexpected API response');
    }
  } else {
    logger.error(
      {
        searchQuery,
        status: response.status,
        message: response.statusText,
        data: await response.text(),
      },
      'OpenAlex API request failed',
    );
    throw new Error('OpenAlex API request failed');
  }
}

const getFilter = (param: FilterParam) => {
  return Object.entries(param).reduce(
    (queryStr, [key, value]) => (queryStr ? `${queryStr},${key}:${value}` : `${key}:${value}`),
    '',
  );
};

const buildQueryString = (searchQuery: Query) =>
  Object.entries(searchQuery).reduce((queryStr, [key, value]) => {
    if (key === 'filter') {
      const filter = `filter=${getFilter(value as FilterParam)}`;
      return queryStr ? `${queryStr}&${filter}` : filter;
    }

    const param = `${key}=${value}`;
    return queryStr ? `${queryStr}&${param}` : param;
  }, '');
