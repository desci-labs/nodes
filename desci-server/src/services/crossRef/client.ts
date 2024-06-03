import { logger as parentLogger } from '../../logger.js';

import { CrossRefHttpResponse, Items, QueryWorkParams, Work } from './definitions.js';
import { keysToDotsAndDashses } from './utils.js';

const logger = parentLogger.child({ module: '[CrossRefClient' });

export const delay = async (timeMs: number) => {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
};

class CrossRefClient {
  baseurl: string;
  // private apiToken: string;
  // private mailto: string;

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

    logger.info(params, 'API INFO');

    if (typeof params === 'object') {
      params = keysToDotsAndDashses(params);
      logger.info(params, 'parsed params');
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
    logger.info(url, 'url params');
    const request = new Request(url, config);
    try {
      return await this.performFetch<Items<Work>>(request);
    } catch (error) {
      logger.error(error, 'LIST WORKS API ERROR');

      // retry after 1 second
      await delay(1000);
      logger.info('Retrying API Request');
      return await this.performFetch<Items<Work>>(request);
    }
  }

  async performFetch<T>(request: Request) {
    const response = (await fetch(request)) as CrossRefHttpResponse<T>;
    response.data = undefined;
    if (response.ok && response.status === 200) {
      if (response.headers.get('content-type').includes('application/json')) {
        response.data = (await response.json()) as T;
      }
    }
    return response;
  }
}

export default CrossRefClient;

// const formatKeys
