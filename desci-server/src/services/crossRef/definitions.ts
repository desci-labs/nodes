export type CrossRefHttpResponse<T> = ({ ok: true; data: T } & Response) | { ok: false; data: undefined };

export interface Item<T> {
  status: string;
  'message-type': string;
  'message-version': string;
  message: T;
}

export interface Items<T> {
  status: string;
  messageType: string;
  messageVersion: string;
  message: {
    itemsPerPage: number;
    query: {
      startIndex: number;
      searchTerms: string | null;
    };
    totalResults: number;
    items: T[];
  };
}

export interface Work {
  author: Author[];
  DOI: string;
  prefix: string;
  title: string;
}

export interface Author {
  given: string;
  family: string;
  sequence: string;
  affiliation: unknown[];
  ORCID?: string;
  authenticatedOrcid?: boolean;
}

interface SearchQueryParams {
  offset: number;
  // mailto: string;
  query: string;
  filter?: string;
  rows: number;
}

export interface QueryWorkParams {
  offset?: number;
  query?: string;
  queryAuthor?: string;
  queryTitle?: string;
  rows?: number;
  select?: WorkSelectOptions[];
}

export enum WorkSelectOptions {
  DOI = 'DOI',
  PREFIX = 'prefix',
  TITLE = 'title',
  AUTHOR = 'author',
}

export type RegisterDoiResponse = { ok: true; batchId: string } | { ok: false; batchId?: never };
