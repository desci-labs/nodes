import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { type QueryInfo, saveData } from './db/index.js';
import { logger } from './logger.js';
import { type DataModels, transformDataModel } from './transformers.js';
import type { Work } from './types/index.js';
import { errWithCause } from 'pino-std-serializers';

const OPEN_ALEX_API = 'https://api.openalex.org/';
export const WORKS_URL = OPEN_ALEX_API + '/works';

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

type Query = {
  filter?: FilterParam;
  'per-page'?: number;
  cursor: string | undefined;
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

export const getInitialWorksQuery = (filter: FilterParam): Query => ({
  filter,
  'per-page': 200,
  cursor: '*',
})

export const MAX_PAGES_TO_FETCH = parseInt(process.env.MAX_PAGES_TO_FETCH || '100');
export const IS_DEV = process.env.NODE_ENV === 'development';
export const SKIP_LOG_WRITE = process.env.SKIP_LOG_WRITE;

async function importWorks(filter?: FilterParam): Promise<Work[] | null> {
  logger.info({ filter }, 'Fetching data from OpenAlex API...');
  try {
    const url = `${OPEN_ALEX_API}/works`;
    const works = await performFetch<Work[]>(url, {
      filter: {
        ...filter,
      },
      'per-page': 200,
      cursor: '*',
    });
    logger.info({ totalWorks: works.length }, 'Fetch done');
    return works;
  } catch (e) {
    const err = e as Error;
    logger.error(errWithCause(err), 'ERROR::');
    return null;
  }
}

export async function fetchPage<T>(
  url: string,
  searchQuery: Query
): Promise<{ data: T[], next_cursor: string | undefined }> {
    const query = buildQueryString(searchQuery);
    logger.info({searchQuery}, 'Fetching page...');
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
        }
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
          data: await response.json(),
        },
        'OpenAlex API request failed',
      );
      throw new Error('OpenAlex API request failed');
    }
}

async function performFetch<T>(url: string, searchQuery: Query): Promise<T> {
  logger.info(searchQuery, 'QUERY');
  let data = [];

  let cursor = searchQuery.cursor || true;
  let roundtrip = 0;
  while (cursor) {
    if (IS_DEV) {
      if (roundtrip >= MAX_PAGES_TO_FETCH) {
        logger.warn({ MAX_PAGES_TO_FETCH }, 'Skipping rest of of pages');
        break;
      }
    }

    const query = Object.entries(searchQuery).reduce((queryStr, [key, value]) => {
      if (key === 'filter') {
        const filter = `filter=${getFilter(value as FilterParam)}`;
        return queryStr ? `${queryStr}&${filter}` : filter;
      }

      const param = `${key}=${value}`;
      return queryStr ? `${queryStr}&${param}` : param;
    }, '');

    const request = new Request(`${url}?${query}`, {
      headers: { 'API-KEY': process.env.OPENALEX_API_KEY as string },
    });
    const response = (await fetch(request)) as Response;

    if (response.ok && response.status === 200) {
      if (response.headers.get('content-type')?.includes('application/json')) {
        const apiRes = (await response.json()) as ApiResponse<T>;
        data = data.concat(...(apiRes.results as any[]));
        cursor = !!apiRes.meta?.next_cursor;
        searchQuery.cursor = apiRes.meta.next_cursor;
        roundtrip++;
      } else {
        break;
      }
    } else {
      logger.error(
        {
          searchQuery,
          status: response.status,
          message: response.statusText,
          data: await response.json(),
        },
        'Failed to fetch from OpenAlex; results may be truncated',
      );
      throw new Error('Fetch failed');
    }
  }
  logger.info({ totalPages: roundtrip }, 'Data fetching finished');
  return data as T;
}

// export const runImport = async (queryInfo: QueryInfo) => {
//   const { query_type, query_from, query_to } = queryInfo;
//   logger.info(queryInfo, 'Running Import');
//
//   const formattedFromDate = query_from.toISOString().replace('Z','');
//   const formattedToDate = query_to.toISOString().replace('Z','');
//
//   const filter: FilterParam =
//     query_type === 'created'
//       ? { from_created_date: formattedFromDate, to_created_date: formattedToDate }
//       : { from_updated_date: formattedFromDate, to_updated_date: formattedToDate };
//
//   const reuseLastFetch = process.env.REUSE_LAST_FETCH;
//   let openAlexData: Work[] | null;
//   if (reuseLastFetch) {
//     logger.warn('Reusing last fetch results from logs/works_raw.json');
//     openAlexData = JSON.parse(readFileSync('logs/works_raw.json', 'utf8'));
//   } else {
//     openAlexData = await importWorks(filter);
//   }
//
//   if (!openAlexData) {
//     logger.warn('Nothing to import');
//     return 0;
//   }
//
//   if (IS_DEV && !reuseLastFetch && !SKIP_LOG_WRITE) {
//     // Denormalized works (relations nested into each work)
//     saveToLogs(openAlexData, 'works_raw.json');
//   }
//
//   const data: DataModels = transformDataModel(openAlexData);
//
//   if (IS_DEV && !reuseLastFetch && !SKIP_LOG_WRITE) {
//     // Normalized into "tables"
//     Object.entries(data).forEach(([key, content]) => saveToLogs(content, `${key}.json`));
//   }
//
//   await saveData(data, queryInfo, []);
//
//   return data.works?.length;
// };

const getFilter = (param: FilterParam) => {
  return Object.entries(param).reduce(
    (queryStr, [key, value]) => (queryStr ? `${queryStr},${key}:${value}` : `${key}:${value}`),
    '',
  );
};

const buildQueryString = (searchQuery: Query) =>
  Object.entries(searchQuery)
    .reduce((queryStr, [key, value]) => {
      if (key === 'filter') {
        const filter = `filter=${getFilter(value as FilterParam)}`;
        return queryStr ? `${queryStr}&${filter}` : filter;
      }

      const param = `${key}=${value}`;
      return queryStr ? `${queryStr}&${param}` : param;
    }, '');

