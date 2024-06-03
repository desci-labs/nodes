export type CrossRefHttpResponse<T> = ({ ok: true; content: T } & Response) | { ok: false; content: undefined };

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
  offset: number;
  query: string;
  queryAuthor?: string;
  queryTitle?: string;
  rows?: number;
  select?: WorkSelectOptions;
}

enum WorkSelectOptions {
  DOI = 'DOI',
  PREFIX = 'prefix',
  TITLE = 'title',
  AUTHOR = 'author',
}

class CrossRefClient {
  baseurl: string;
  // private apiToken: string;
  // private mailto: string;

  constructor(
    baseUrl: string,
    private _plusToken?: string,
    private _mailto?: string,
  ) {
    this.baseurl = baseUrl;
    // this.apiToken = plusToken;
    // this.mailto = mailto;
  }

  async listWorks(query: QueryWorkParams = undefined) {
    let params: { [k: string]: any } = query;
    const url = `${this.baseurl}/works?`;
    const config = {
      method: 'GET',
      mode: 'cors',
      headers: {},
    };

    // add plus token if available
    if (this._plusToken) {
      config.headers['Crossref-Plus-API-Token'] = `Bearer ${this._plusToken}`;
    }

    // polite api
    if (this._mailto) {
      if (typeof params === 'object') {
        params['mailto'] = this._mailto;
      } else {
        params = {
          mailto: this._mailto,
        };
      }
    }
  }

  async performFetch() {}
}

export default CrossRefClient;

// const formatKeys
