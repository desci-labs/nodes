import { DocumentId } from '@automerge/automerge-repo';
import { ManifestActions, ResearchObjectV1Author, ResearchObjectV1AuthorRole } from '@desci-labs/desci-models';

import { logger as parentLogger } from '../logger.js';
import { ONE_DAY_TTL, getFromCache, setToCache } from '../redisClient.js';

import repoService from './repoService.js';

const logger = parentLogger.child({ module: '[AutomatedMetadataClient]' });

export const delay = async (timeMs: number) => {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
};

export type MetadataParam = {
  cid?: string;
  doi?: string;
};

export type AutomatedMetadataResponse = {
  output: {
    creator: {
      [k in string]: {
        '@id': string;
        affiliation: string;
        name: string;
        role: string;
      };
    };
    datePublished: [number, number, number]; // [year, month, day]
    keywords: Array<{ display_name: string; id: string; score: number }>;
    license: Array<{
      url: string;
      'content-version': string;
      'delay-in-days': number;
      start: {
        'date-parts': Array<[number, number, number]>;
        'date-time': string;
        timestamp: number;
      };
    }>;
    oa_url: string | null;
    title: string;
  };
};

export type MetadataResponse = {
  authors: Array<{ orcid: string; name: string; affiliation: string }>;
  title: string;
  pdfUrl: string | null;
  keywords: string[];
};

/**
 * A wrapper http client for querying, caching and parsing requests
 * from the CrossRef Rest Api https://www.crossref.org/documentation/retrieve-metadata/rest-api/
 * Initialize constructor with CrossRef Api url https://api.crossref.org, Api token and a polite Mail
 */
export class AutomatedMetadataClient {
  baseurl: string;

  constructor(
    baseUrl: string,
    private _accessToken: string,
  ) {
    if (!baseUrl) {
      logger.error('Pass Cross ref api as argument to AutomatedMetadataClient');
      throw Error('Pass Cross ref api as argument to AutomatedMetadataClient');
    }
    this.baseurl = baseUrl;
  }

  /**
   * Returns all the metadata associated with a pdf cid or doi url
   */
  async getResourceMetadata(query: MetadataParam): Promise<MetadataResponse | null> {
    if (!query.cid && !query.doi) throw new Error('Invalid data');

    const body: { pdf: string; doi?: string } | { doi: string; pdf?: string } = { pdf: '' };

    if (query.cid) {
      body.pdf = query.cid;
    }

    if (query.doi) {
      body.doi = query.doi;
    }
    logger.info(body, 'API INFO');

    // config.body = body;

    const url = `${this.baseurl}/invoke-script`;
    logger.info(url, 'url params');
    const config: RequestInit = {
      method: 'POST',
      mode: 'cors',
      headers: {},
      body: JSON.stringify(body),
    };

    // add plus token if available
    if (this._accessToken && config.headers) {
      config.headers['X-API-Key'] = `${this._accessToken}`;
    }

    const request = new Request(url, config);
    try {
      const response = await this.performFetch<AutomatedMetadataResponse | null>(request, body.doi || body.pdf);
      return response ? this.transformResponse(response) : null;
    } catch (error) {
      logger.error(error, 'ERROR');
      return null;
    }
  }

  async performFetch<T>(request: Request, cacheKey: string): Promise<T> {
    const responseFromCache = await getFromCache<T>(request.url);
    logger.info(responseFromCache, 'METADATA From Cache');
    if (responseFromCache) return responseFromCache;

    const response = (await fetch(request)) as Response;
    let data: T;

    if (response.ok && response.status === 200) {
      if (response.headers.get('content-type')?.includes('application/json')) {
        data = (await response.json()) as T;
        logger.info(data, 'SET TO CACHE');
        await setToCache(cacheKey, data, ONE_DAY_TTL);
        return data;
      }
    }
    return null as T;
  }

  transformResponse(data: AutomatedMetadataResponse): MetadataResponse {
    const authors = data.output?.creator
      ? Object.entries(data.output.creator).map(([name, creator]) => ({
          orcid: creator['@id'],
          affiliation: creator.affiliation,
          name,
        }))
      : [];
    const keywords = data.output?.keywords ? data.output.keywords.map((keyword) => keyword.display_name) : [];
    const metadata: MetadataResponse = { authors, keywords, title: data.output.title, pdfUrl: data.output.oa_url };
    logger.info(metadata, 'METADATA');
    return metadata;
  }

  async automateMetadata(metadata: MetadataResponse, node: { uuid: string; documentId: string }) {
    const actions: ManifestActions[] = [];
    if (metadata.title) {
      actions.push({ type: 'Update Title', title: metadata.title });
    }

    if (metadata.authors) {
      actions.push({
        type: 'Add Contributors',
        contributors: metadata.authors.map(
          (author) =>
            ({
              name: author.name,
              orcid: author.orcid,
              role: ResearchObjectV1AuthorRole.AUTHOR,
              organisations: [{ id: author.affiliation, name: author.affiliation }],
            }) as ResearchObjectV1Author,
        ),
      }); //
    }

    const response = await repoService.dispatchAction({
      uuid: node.uuid,
      documentId: node.documentId as DocumentId,
      actions,
    });
    logger.info(response, 'AUTOMATE METADATA');
    return response;
  }
}
