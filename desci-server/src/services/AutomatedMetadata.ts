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
  output: Array<{
    creator?: {
      [k in string]: {
        '@id': string;
        affiliation: string;
        name: string;
        role: string;
        ror: string;
      };
    };
    authors?: {
      [k in string]: {
        '@id': string;
        affiliation: string;
        name: string;
        role: string;
        ror: string;
      };
    };
    datePublished?: [number, number, number]; // [year, month, day]
    keywords?: Array<{ display_name: string; id: string; score: number }>;
    license?: Array<{
      url: string;
      'content-version': string;
      'delay-in-days': number;
      start: {
        'date-parts': Array<[number, number, number]>;
        'date-time': string;
        timestamp: number;
      };
    }>;
    abstract?: string;
    oa_url?: string | null;
    title: string;
  }>;
};

export type MetadataResponse = {
  abstract?: string;
  authors: Array<{ orcid: string; name: string; affiliations: { name: string; id: string }[] }>;
  title: string;
  pdfUrl: string | null;
  keywords: string[];
  doi?: string;
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
      body.pdf = `https://ipfs.desci.com/ipfs/${query.cid}`;
    }

    if (query.doi) {
      body.doi = query.doi;
    }
    logger.info({ body }, 'API INFO');

    // config.body = body;

    const url = `${this.baseurl}/invoke-script`;
    logger.info({ url }, 'url params');
    const config: RequestInit = {
      method: 'POST',
      mode: 'cors',
      headers: { Accept: '*/*', 'content-type': 'application/json' },
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
    logger.info({ responseFromCache, request: request.headers, cacheKey }, 'METADATA From Cache');
    if (responseFromCache) return responseFromCache;

    const response = (await fetch(request)) as Response;
    let data: T;
    logger.info({ status: response.status, header: response.headers.get('content-type') }, 'RESPONSE FROM METADATA');
    if (response.ok && response.status === 200) {
      if (response.headers.get('content-type')?.includes('application/json')) {
        data = (await response.json()) as T;
        logger.info(data, 'SET TO CACHE');
        await setToCache(cacheKey, data, ONE_DAY_TTL);
        return data;
      }
    } else {
      logger.info({ body: await response.text() }, 'ERROR RESPONSE');
    }
    return null as T;
  }

  transformResponse(data: AutomatedMetadataResponse): MetadataResponse {
    logger.info({ data }, 'TRANSFORM');
    const output = Array.isArray(data.output) ? data.output?.[0] : data.output;

    const contributors = output?.authors || output?.creator;
    const authors = contributors
      ? Object.entries(contributors).map(([name, creator]) => ({
          affiliations: [{ name: creator.affiliation, id: creator.ror }],
          name,
          ...(creator['@id'] && creator['@id'].toLowerCase() !== 'none' && { orcid: creator['@id'] }),
        }))
      : [];
    const keywords =
      output?.keywords && Array.isArray(output.keywords) ? output.keywords.map((keyword) => keyword.display_name) : [];
    const metadata: MetadataResponse = {
      authors,
      keywords,
      title: output.title,
      pdfUrl: output.oa_url,
      abstract: output.abstract ?? '',
    };

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
              role: ResearchObjectV1AuthorRole.AUTHOR,
              ...(author.affiliations.length > 0 && { organizations: author.affiliations }),
              ...(author.orcid && { orcid: author.orcid }),
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
