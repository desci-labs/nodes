import { Work, Institution } from "./types/index.js";
console.log("works");

const OPEN_ALEX_API = "https://api.openalex.org/";

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
  "per-page"?: number;
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

// const result = await fetch(
//   `${OPEN_ALEX_API}/works?filter=from_publication_date:2024-07-16,to_publication_date:2024-07-16&per-page=200&cursor=*`,
//   {
//     headers: {
//       Accept: "*/*",
//       "content-type": "application/json",
//     },
//   }
// );
async function importWorks(): Promise<Work[] | null> {
  try {
    const url = `${OPEN_ALEX_API}/works`;
    const works = await performFetch<Work[]>(url, {
      filter: {
        from_publication_date: "2024-07-16",
        to_publication_date: "2024-07-16",
      },
      "per-page": 200,
      cursor: "*",
    });
    console.log("RESPONSE: ", works.length);
    return works;
  } catch (err) {
    console.log("ERROR::", err);
    return null;
  }
}

async function importInstitutions(): Promise<Institution[] | null> {
  try {
    const url = `${OPEN_ALEX_API}/institutions`;
    const institutions = await performFetch<Institution[]>(url, {
      filter: {
        has_ror: true,
      },
      "per-page": 200,
      cursor: "*",
    });
    // console.log("RESPONSE: ", institutions);
    return institutions;
  } catch (err) {
    console.log("ERROR::", err);
    return null;
  }
}

async function performFetch<T>(url: string, searchQuery: Query): Promise<T> {
  let data = [];

  const getFilter = (param: FilterParam) => {
    const filter = Object.entries(param).reduce(
      (queryStr, [key, value]) =>
        queryStr ? `${queryStr},${key}:${value}` : `${key}:${value}`,
      ""
    );
    return filter;
  };

  let cursor = searchQuery.cursor || true;

  while (cursor) {
    let query = Object.entries(searchQuery).reduce((queryStr, [key, value]) => {
      if (key === "filter") {
        const filter = `filter=${getFilter(value as FilterParam)}`;
        return queryStr ? `${queryStr}&${filter}` : filter;
      }

      const param = `${key}=${value}`;
      return queryStr ? `${queryStr}&${param}` : param;
    }, "");

    // console.log("QUERY: ", query);
    const request = new Request(`${url}?${query}`, {
      headers: { "API-KEY": "" },
    });
    const response = (await fetch(request)) as Response;

    if (response.ok && response.status === 200) {
      // console.log("Api success: ", response.status, response.statusText);

      if (response.headers.get("content-type")?.includes("application/json")) {
        const apiRes = (await response.json()) as ApiResponse<T>;
        data = data.concat(...(apiRes.results as any[]));
        // console.log(
        //   "NEXT CURSOR: ",
        //   apiRes.meta.next_cursor,
        //   !!apiRes.meta.next_cursor
        // );
        cursor = !!apiRes.meta?.next_cursor;
        searchQuery.cursor = apiRes.meta.next_cursor;
        // return data;
      } else {
        break;
      }
    } else {
      // logger.info({ body: await response.text() }, 'ERROR RESPONSE');
      console.log("Api error: ", response.status, response.statusText);
      // data = null;
      break;
    }
  }

  return data as T;
}

async function main() {
  const works = await importWorks();
  // const institutions = await importInstitutions();
  // const concepts = await importConcepts();
  // const authors = await importAuthors();
  // const sources = await importSources();
  return works;
}

main()
  .then((done) => console.log("Import script done: ", done?.length))
  .catch((err) => console.log("ERROR: data import crashed due to: ", err));
