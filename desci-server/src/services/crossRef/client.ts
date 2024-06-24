import { logger as parentLogger } from '../../logger.js';
import { ONE_DAY_TTL, getFromCache, setToCache } from '../../redisClient.js';

import { CrossRefHttpResponse, Items, QueryWorkParams, Work } from './definitions.js';
import { keysToDotsAndDashses } from './utils.js';

const logger = parentLogger.child({ module: '[CrossRefClient]' });

export const delay = async (timeMs: number) => {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
};

/**
 * A wrapper http client for querying, caching and parsing requests
 * from the CrossRef Rest Api https://www.crossref.org/documentation/retrieve-metadata/rest-api/
 * Initialize constructor with CrossRef Api url https://api.crossref.org, Api token and a polite Mail
 */
class CrossRefClient {
  baseurl: string;

  constructor(
    baseUrl: string,
    private _plusToken?: string,
    private _mailto?: string,
  ) {
    if (!baseUrl) {
      logger.error('Pass Cross ref api as argument to CrossRefClient');
      throw Error('Pass Cross ref api as argument to CrossRefClient');
    }
    this.baseurl = baseUrl;
  }

  /**
   * Returns a list of all works (journal articles,
   * conference proceedings, books, components, etc),
   */
  async listWorks(query: QueryWorkParams = undefined) {
    let params: { [k: string]: any } = query;
    let url = `${this.baseurl}/works?`;
    const config: RequestInit = {
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

    logger.info({ params }, 'API INFO');

    if (typeof params === 'object') {
      params = keysToDotsAndDashses(params);
      logger.info({ params }, 'parsed params');
    }

    for (const [key, value] of Object.entries(params)) {
      switch (typeof value) {
        case 'string':
          url += `${key}=${value}&`;
          break;
        case 'number':
          url += `${key}=${value}&`;
          break;
        case 'object':
          url += `${key}=${value.join(',')}&`;
          break;
        default:
          break;
      }
    }

    url = url.slice(0, -1);
    url = encodeURI(url);
    logger.info({ url }, 'url params');
    const request = new Request(url, config);
    try {
      return await this.performFetch<Items<Work>>(request);
    } catch (error) {
      logger.error({ error }, 'LIST WORKS API ERROR');

      // retry after 1 second
      await delay(1000);
      logger.info('Retrying API Request');
      return await this.performFetch<Items<Work>>(request);
    }
  }

  /**
   * Returns a list of all works (journal articles,
   * conference proceedings, books, components, etc),
   */
  async getDoiMetadata(doi: string) {
    const params: { [k: string]: any } = {};
    let url = `https://www.crossref.org/openurl/?pid=myemail@crossref.org&format=unixref&id=${doi}`;
    const config: RequestInit = {
      method: 'GET',
      mode: 'cors',
      headers: {},
    };

    // polite api
    if (this._mailto) {
      params['pid'] = this._mailto;
    }

    params['format'] = 'unixref';
    params['id'] = doi;

    logger.info(params, 'API INFO');

    for (const [key, value] of Object.entries(params)) {
      url += `${key}=${value}&`;
    }

    url = url.slice(0, -1);
    url = encodeURI(url);
    logger.info(url, 'url params');
    const request = new Request(url, config);
    try {
      const response = await fetch(request);
      if (!response.ok) return null;
      const body = await response.text();
      logger.info(body, 'XML RESPONSE');
    } catch (error) {
      logger.error(error, 'OPEN URL SEARCH ERROR');
      return null;
    }
  }

  async performFetch<T>(request: Request) {
    const responseFromCache = await getFromCache<T>(request.url);
    // logger.info(responseFromCache, 'DOI From Cache');
    if (responseFromCache) return { ok: true, status: 200, data: responseFromCache };

    const response = (await fetch(request)) as CrossRefHttpResponse<T>;
    response.data = undefined;
    if (response.ok && response.status === 200) {
      if (response.headers.get('content-type').includes('application/json')) {
        response.data = (await response.json()) as T;
        logger.info(response.ok, 'SET TO CACHE');
        await setToCache(request.url, response.data, ONE_DAY_TTL);
      }
    }
    return response;
  }
}

export default CrossRefClient;
