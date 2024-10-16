import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';

// import { startOfDay, endOfDay, subDays } from "date-fns";
import { saveData } from './db/index.js';
import { logger } from './logger.js';
import { transformDataModel } from './transformers.js';
import { Institution, Work } from './types/index.js';

const OPEN_ALEX_API = 'https://api.openalex.org/';

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

type FilterParam = {
  from_publication_date?: string;
  to_publication_date?: string;
  from_created_date?: string;
  from_updated_date?: string;
  to_created_date?: string;
  to_updated_date?: string;
  has_ror?: boolean;
};

const MAX_PAGES_TO_FETCH = 100;

async function importWorks(filter?: FilterParam): Promise<Work[] | null> {
  logger.info(filter, 'Filter');
  try {
    const url = `${OPEN_ALEX_API}/works`;
    const works = await performFetch<Work[]>(url, {
      filter: {
        ...filter,
        // from_created_date: "2024-07-27",
        // to_created_date: "2024-07-27",
        // from_updated_date: "2024-07-30T20:00:00.347Z",
        // to_updated_date: "2024-07-30T23:29:50.347Z",
      },
      'per-page': 200,
      cursor: '*',
    });
    logger.info({ totalWorks: works.length }, 'Fetch done');
    return works;
  } catch (err) {
    logger.error({ err }, 'ERROR::');
    return null;
  }
}

async function performFetch<T>(url: string, searchQuery: Query): Promise<T> {
  logger.info(searchQuery, 'QUERY');
  let data = [];

  const getFilter = (param: FilterParam) => {
    const filter = Object.entries(param).reduce(
      (queryStr, [key, value]) => (queryStr ? `${queryStr},${key}:${value}` : `${key}:${value}`),
      '',
    );
    return filter;
  };

  let cursor = searchQuery.cursor || true;
  let roundtrip = 0;

  while (cursor) {
    if (process.env.NODE_ENV === 'development') {
      /* When running script locally,
        break loop prematurely to avoid overloading memory
      */
      if (roundtrip >= MAX_PAGES_TO_FETCH) break; // todo: remove line before push to prod
    }

    const query = Object.entries(searchQuery).reduce((queryStr, [key, value]) => {
      if (key === 'filter') {
        const filter = `filter=${getFilter(value as FilterParam)}`;
        return queryStr ? `${queryStr}&${filter}` : filter;
      }

      const param = `${key}=${value}`;
      return queryStr ? `${queryStr}&${param}` : param;
    }, '');

    // logger.info("QUERY: ", query);
    const request = new Request(`${url}?${query}`, {
      headers: { 'API-KEY': process.env.OPENALEX_API_KEY as string },
    });
    const response = (await fetch(request)) as Response;

    if (response.ok && response.status === 200) {
      // logger.info("Api success: ", response.status, response.statusText);

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
      logger.info(
        {
          status: response.status,
          message: response.statusText,
          data: await response.json(),
        },
        'Api error: ',
      );
      break;
    }
  }

  return data as T;
}

const saveToLogs = (data: string, logFile: string) => {
  const TMP_DIR = path.join(process.cwd(), 'logs');
  const LOG_FILE = path.join(TMP_DIR, logFile);
  if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR);
  }
  if (data) {
    writeFileSync(LOG_FILE, data);
  }
};

export const runImport = async ({ from, to }: { from: Date; to: Date }) => {
  // figure time parameters
  // let currentDate = new Date();
  // let from_created_date = startOfDay(subDays(currentDate, 1));
  // let to_created_date = endOfDay(subDays(currentDate, 1));
  logger.info({ from, to }, 'Running Import');

  const from_created_date = from; // startOfDay(subDays(currentDate, 0));
  const to_created_date = to; // endOfDay(subDays(currentDate, 0));

  const dateFormatter = new Intl.DateTimeFormat('fr-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const openAlexData = await importWorks({
    from_created_date: dateFormatter.format(from_created_date),
    to_created_date: dateFormatter.format(to_created_date),
    // from_updated_date: from_created_date.toISOString(),
    // to_updated_date: to_created_date.toISOString(),
  });

  if (!openAlexData) {
    // logger issue or result
    logger.info('Nothing to import');
    return 0;
  }

  if (process.env.NODE_ENV === 'development') {
    saveToLogs(JSON.stringify(openAlexData?.slice(0, 100)), 'works_raw.json');
  }

  const transformedData = transformDataModel(openAlexData);
  const {
    authors,
    authors_ids,
    works_authorships,
    works,
    works_id,
    works_concepts,
    works_biblio,
    works_locations,
    works_mesh,
    works_open_access,
    works_primary_locations,
    works_best_oa_locations,
    works_referenced_works,
    works_related_works,
    works_topics,
  } = transformedData;

  // const models = transformApiResponseToDbModel(works);

  if (process.env.NODE_ENV === 'development') {
    saveToLogs(JSON.stringify(authors), 'authors.json');
    saveToLogs(JSON.stringify(authors_ids), 'authors_ids.json');
    saveToLogs(JSON.stringify(works_authorships), 'works_authorships.json');
    saveToLogs(JSON.stringify(works.slice(1, 100)), 'works.json');
    saveToLogs(JSON.stringify(works_id), 'works_id.json');
    saveToLogs(JSON.stringify(works_concepts), 'works_concepts.json');
    saveToLogs(JSON.stringify(works_biblio), 'works_biblio.json');
    saveToLogs(JSON.stringify(works_locations), 'works_locations.json');
    saveToLogs(JSON.stringify(works_best_oa_locations), 'works_best_oa_locations.json');
    saveToLogs(JSON.stringify(works_open_access), 'works_open_access.json');
    saveToLogs(JSON.stringify(works_mesh), 'works_mesh.json');
    saveToLogs(JSON.stringify(works_primary_locations), 'works_primary_locations.json');
    saveToLogs(JSON.stringify(works_referenced_works), 'works_referenced_works.json');
    saveToLogs(JSON.stringify(works_related_works), 'works_related_works.json');
    saveToLogs(JSON.stringify(works_topics), 'works_topics.json');
  }

  await saveData(transformedData);

  return works?.length;
};
