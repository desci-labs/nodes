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
  abstract?: string;
  author: Author[];
  DOI: string;
  prefix: string;
  title: string[];
  resource?: {
    primary?: {
      URL?: string;
    };
  };
  publisher: string;
  'is-referenced-by-count': number;
  URL?: string;
  published: {
    'date-parts': Array<number[]>;
  };
  license: [
    {
      start: {
        'date-parts': Array<number[]>;
        'date-time': string;
        timestamp: number;
      };
      'content-version': 'vor';
      'delay-in-days': number;
      URL: string; // 'http://onlinelibrary.wiley.com/termsAndConditions#vor';
    },
  ];
  type: 'journal-article' | 'posted-content';
  'short-container-title'?: string[];
  'container-title'?: string[];
  institution?: Array<{
    name: string;
  }>;
}

export interface Author {
  given: string;
  family: string;
  name?: string;
  sequence: string;
  affiliation: { name: string }[];
  ORCID?: string;
  authenticatedOrcid?: boolean;
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
