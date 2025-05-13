import { DocumentId } from '@automerge/automerge-repo';
import { ManifestActions, ResearchObjectV1Author, ResearchObjectV1AuthorRole } from '@desci-labs/desci-models';
import axios from 'axios';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import { parseStringPromise } from 'xml2js';

import { logger as parentLogger } from '../logger.js';
import { ONE_DAY_TTL, getFromCache, setToCache } from '../redisClient.js';

import { getOrcidFromURL } from './crossRef/utils.js';
import repoService from './repoService.js';

const logger = parentLogger.child({ module: '[AutomatedMetadataClient]' });

const IPFS_RESOLVER = process.env.IPFS_RESOLVER_OVERRIDE || 'https://ipfs.desci.com/ipfs';

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
  authors: Array<{ orcid?: string; name: string; affiliations?: { name: string; id: string }[] }>;
  title: string;
  pdfUrl?: string | null;
  keywords?: string[];
  doi?: string;
};

export interface OpenAlexWork {
  id: string;
  title: string;
  doi: string;
  open_access: {
    is_oa: boolean;
    oa_status: string;
    oa_url: string;
  };
  best_oa_location: {
    is_oa: boolean;
    pdf_url: string;
  };
  authorships: Array<{
    author_position: string;
    author: {
      id: string;
      display_name: string;
      orcid: string;
    };
    institutions: Array<{
      id: string;
      display_name: string;
      ror: string;
      country_code: string;
      type: string;
      lineage: string[];
    }>;
    countries: string[];
    is_corresponding: boolean;
    raw_author_name: string;
    raw_affiliation_strings: string[];
    affiliations: Array<{
      raw_affiliation_string: string;
      institution_ids: string[];
    }>;
  }>;
  keywords: Array<{
    id: string;
    display_name: string;
    score: number;
  }>;
  abstract_inverted_index?: { [key: string]: number[] };
}

const DEFAULT_GROBID_METADATA = {
  authors: [],
  title: '',
  abstract: '',
  doi: '',
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
      body.pdf = `${IPFS_RESOLVER}/${query.cid}`;
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

  /**
   * Returns all the Grobid header metadata associated with a pdf cid
   */
  async queryFromGrobid(cid: string) {
    try {
      if (!cid) throw new Error('Invalid data');

      const pdfUrl = `${IPFS_RESOLVER}/${cid}`;

      let response = await axios.head(pdfUrl);
      const contentType = response.headers['content-type'];
      const fileSize = response.headers['content-length'];

      if (contentType.toLowerCase() !== 'application/pdf') {
        logger.error({ contentType, cid: cid }, 'CID CONTENT NOT A PDF FILE');
        return DEFAULT_GROBID_METADATA;
      }

      logger.info({ contentType, pdfUrl }, 'PDF RESPONSE CONTENT');

      const axiosRes = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
      logger.info({ status: axiosRes.status, headers: axiosRes.headers }, 'DOWNLOAD PDF AXIOS');

      const fetchRes = await fetch(pdfUrl);
      logger.info({ status: fetchRes.status, headers: fetchRes.headers }, 'DOWNLOAD PDF FETCH');
      const res = await fetchRes.arrayBuffer();
      const buffer = Buffer.from(res);

      logger.info({ SIZE: buffer.length, fileSize }, 'PDF CONTENT');

      const formdata = new FormData();
      formdata.append('input', buffer, { filename: 'manuscript.pdf', contentType: 'application/pdf' });
      const url = 'https://grobid-dev.desci.com/api/processHeaderDocument';
      response = await axios.request({ url, method: 'POST', data: formdata, headers: { ...formdata.getHeaders() } });

      logger.info({ header: response.data }, 'GROBID RESPONSE');
      if (response.status !== 200) return DEFAULT_GROBID_METADATA;
      // transform data
      const headerMetadata = parseBibtext(response.data);
      if (!headerMetadata.authors?.length || !headerMetadata.title || !headerMetadata.abstract) {
        // Inadequate metadata extracted, try processFulltextDocument API
        logger.info(headerMetadata, 'Inadequate metadata extracted, trying processFulltextDocument API');

        const fulltextUrl = 'https://grobid-dev.desci.com/api/processFulltextDocument';
        const formdata = new FormData();
        formdata.append('input', buffer, { filename: 'manuscript.pdf', contentType: 'application/pdf' });
        const fulltextRes = await axios.request({
          url: fulltextUrl,
          method: 'POST',
          data: formdata,
          headers: { ...formdata.getHeaders() },
        });
        const fulltextMetadata = await parseGrobidFulltextXml(fulltextRes.data);

        // Fill in the headerMetadata with the longer values from the fulltextDocument API
        Object.keys(headerMetadata).forEach((key) => {
          if (fulltextMetadata[key] && fulltextMetadata[key].length > headerMetadata[key].length) {
            headerMetadata[key] = fulltextMetadata[key];
          }
        });
      }

      return headerMetadata;
    } catch (error) {
      logger.error(error, 'ERROR');
      return DEFAULT_GROBID_METADATA;
    }
  }

  /**
   * Pull metadata from Open Alex api
   */
  async queryDoiFromOpenAlex(doi: string): Promise<MetadataResponse | null> {
    try {
      const result = await fetch(
        `https://api.openalex.org/works/doi:${doi}?select=id,title,doi,authorships,keywords,open_access,best_oa_location,abstract_inverted_index`,
        {
          headers: {
            Accept: '*/*',
            'content-type': 'application/json',
          },
        },
      );
      logger.info({ status: result.status, message: result.statusText }, 'OPEN ALEX QUERY');
      const work = (await result.json()) as OpenAlexWork;
      // logger.info({ openAlexWork: work }, 'OPEN ALEX QUERY');
      return transformOpenAlexWorkToMetadata(work);
    } catch (err) {
      logger.error({ err }, 'ERROR: OPEN ALEX WORK QUERY');
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
              id: uuidv4(),
              name: author.name,
              role: [],
              ...(author.affiliations.length > 0 && { organizations: author.affiliations }),
              ...(author.orcid && { orcid: getOrcidFromURL(author.orcid) }),
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

type GrobidMetadata = {
  authors: string[];
  title: string;
  abstract: string;
  doi: string;
};

/**
 * Custom Bibtext to JSON parser for pdf headers returned
 * from Grobid 'https://grobid-dev.desci.com/api/processHeaderDocument'
 * @param input Bibtext string
 * @returns Metadata
 */
const parseBibtext = (input: string): GrobidMetadata => {
  const metadata: GrobidMetadata = { title: '', authors: [], abstract: '', doi: '' };

  let cursor = 0;

  const skipSpaces = (text: string) => {
    let char = text[cursor];
    while (char === ' ') {
      cursor++;
      char = text[cursor];
    }
  };

  const parseFieldName = (text: string) => {
    // parseFieldName
    const start = cursor;
    while (text[cursor] !== ' ') {
      cursor++;
    }
    cursor++;
    const name = text.slice(start, cursor).trim();
    console.log({ fieldName: name });
    return name;
  };

  const skipUntil = (delimiter: string) => {
    // skip until delimiter
    while (input[cursor] !== delimiter) {
      cursor += 1;
    }

    // move cursor to next char after the delimeter
    cursor += 1;
    // console.log("skipped until", input[cursor], delimiter);
  };

  const parseFieldValue = (fieldName: string) => {
    // parseFieldValue

    let start = cursor,
      line = '';
    console.log('start', start);

    // skip to start of value
    skipUntil('{');
    if (input[cursor] === '}' && input[cursor - 1] === '{') return;

    switch (fieldName) {
      case 'author':
        console.log('Parse author');
        start = cursor;
        console.log({ start, cursor });
        skipUntil('}');
        line = input.substring(start, cursor - 1);
        const authors = line
          .split(' and ')
          .map((text) =>
            text
              .trim()
              .split(',')
              .map((t) => t.trim())
              .join(' '),
          )
          .filter(Boolean);
        // console.log({ authors, line, cursor });
        metadata['authors'] = authors;
        break;
      case 'title':
        console.log('Parse title');
        // skipUntil("{");
        start = cursor;
        skipUntil('}');
        line = input.substring(start, cursor - 1);
        const title = line.trim();
        // console.log({ title });
        metadata['title'] = title;
        break;
      case 'doi':
        // Parse doi
        start = cursor;
        skipUntil('}');
        line = input.substring(start, cursor - 1);
        const doi = line.trim();
        // console.log({ doi });
        metadata['doi'] = doi;
        break;
      case 'abstract':
        // Parse abstract
        start = cursor;
        skipUntil('}');
        line = input.substring(start, cursor - 1);
        const abstract = line.trim();
        metadata['abstract'] = abstract;
        break;
      default:
        console.log('Unknown field value: ', fieldName);
        skipUntil('}');
        break;
    }
  };

  const skipBy = (n: number) => {
    cursor += n;
  };

  while (cursor < input.length) {
    const char = input[cursor];
    // console.log({ cursor, char });

    switch (char) {
      case '@':
        console.log('Found @', { cursor });
        skipUntil('\n');
        break;
      case '-1':
        // skip to next character as this is irrelevant
        skipUntil('\n');
        break;
      case ' ':
        // skip spaces
        skipSpaces(input);
        break;
      case '{':
        // skip opening tag
        skipBy(1);
        break;
      case '}':
        // skip closing tag
        skipBy(1);
        break;
      case '\n':
        // skip line break
        skipBy(1);
        break;
      case ',':
        // skip end of value delimiter
        skipBy(1);
        break;
      case '\r':
        // skip spaces
        skipBy(1);
        break;
      default:
        const fieldName = parseFieldName(input);
        parseFieldValue(fieldName);
        break;
    }

    console.log({ cursor });
  }

  return metadata;
};

/**
 * Parses the TEI XML response from Grobid's processFulltextDocument endpoint.
 * Requires the 'xml2js' library.
 * @param xmlString The XML response string from Grobid.
 * @returns Extracted metadata in the standard format.
 */
const parseGrobidFulltextXml = async (xmlString: string): Promise<GrobidMetadata> => {
  const metadata: GrobidMetadata = { ...DEFAULT_GROBID_METADATA, authors: [] }; // Clone default

  try {
    // Explicit options often help with Grobid's structure
    const options = {
      explicitArray: false, // Don't put single elements into arrays
      tagNameProcessors: [(name: string) => name.toLowerCase()], // Normalize tag names
      attrNameProcessors: [(name: string) => name.toLowerCase()], // Normalize attribute names
      // Ignore attributes generally if they cause issues, but keep for now
      // ignoreAttrs: true,
      // explicitRoot: false, // Usually default, but sometimes helps
    };
    const parsedXml = await parseStringPromise(xmlString, options);

    const tei = parsedXml?.tei;
    const fileDesc = tei?.teiheader?.filedesc;
    const profileDesc = tei?.teiheader?.profiledesc;

    // --- Extract Title ---
    metadata.title = fileDesc?.titlestmt?.title?._ || fileDesc?.titlestmt?.title || '';
    if (typeof metadata.title !== 'string') {
      metadata.title = ''; // Handle cases where title might be an object
    }

    // --- Extract Authors ---
    const authorsRaw = fileDesc?.sourcedesc?.biblstruct?.analytic?.author;
    if (Array.isArray(authorsRaw)) {
      metadata.authors = authorsRaw
        .map((author: any) => {
          const persName = author?.persname;
          if (!persName) return '';
          const forename = (
            Array.isArray(persName.forename)
              ? persName.forename.map((f: any) => f._ || f)
              : [persName.forename?._ || persName.forename]
          )
            .filter(Boolean)
            .join(' ');
          const surname = persName.surname?._ || persName.surname || '';
          return `${forename} ${surname}`.trim();
        })
        .filter(Boolean);
    } else if (authorsRaw?.persname) {
      // Handle single author case
      const persName = authorsRaw.persname;
      const forename = (
        Array.isArray(persName.forename)
          ? persName.forename.map((f: any) => f._ || f)
          : [persName.forename?._ || persName.forename]
      )
        .filter(Boolean)
        .join(' ');
      const surname = persName.surname?._ || persName.surname || '';
      metadata.authors = [`${forename} ${surname}`.trim()].filter(Boolean);
    }

    // --- Extract Abstract ---
    const abstractElement = profileDesc?.abstract;
    let abstractText = '';

    if (abstractElement) {
      // Prioritize looking inside abstract > div > p
      const divElement = abstractElement.div;
      if (divElement?.p) {
        const paragraphs = Array.isArray(divElement.p) ? divElement.p : [divElement.p];
        abstractText = paragraphs
          .map((p: any) => (typeof p === 'string' ? p.trim() : (p?._ || '').trim())) // Trim each paragraph
          .filter(Boolean) // Remove empty strings
          .join('\n\n'); // Join paragraphs with double newline
      } else if (typeof divElement === 'string') {
        // Check text directly in div
        abstractText = divElement.trim();
      } else if (divElement?._) {
        // Check text in div._ (if div has attributes)
        abstractText = divElement._.trim();
      } else if (abstractElement.p) {
        // Fallback: Check for <p> directly under <abstract>
        const paragraphs = Array.isArray(abstractElement.p) ? abstractElement.p : [abstractElement.p];
        abstractText = paragraphs
          .map((p: any) => (typeof p === 'string' ? p.trim() : (p?._ || '').trim()))
          .filter(Boolean)
          .join('\n\n');
      } else if (typeof abstractElement === 'string') {
        // Fallback: Text directly under <abstract>
        abstractText = abstractElement.trim();
      } else if (abstractElement._) {
        // Fallback: Text under <abstract> with attributes
        abstractText = abstractElement._.trim();
      }
    }
    metadata.abstract = abstractText;

    // --- Extract DOI ---
    const idno = fileDesc?.publicationstmt?.idno;
    if (Array.isArray(idno)) {
      const doiElement = idno.find((id: any) => id?.$?.type?.toLowerCase() === 'doi');
      metadata.doi = doiElement?._ || '';
    } else if (idno?.$?.type?.toLowerCase() === 'doi') {
      metadata.doi = idno._ || '';
    }
  } catch (error) {
    logger.error({ error, xmlSubstring: xmlString.substring(0, 500) }, 'Failed to parse Grobid Fulltext XML');
    // Return default metadata in case of parsing error
    return { ...DEFAULT_GROBID_METADATA, authors: [] }; // Return a fresh clone
  }

  logger.info({ parsedMetadata: metadata }, 'Parsed Grobid Fulltext XML Metadata'); // Log successful parsing
  return metadata;
};

const transformOpenAlexWorkToMetadata = (work: OpenAlexWork): MetadataResponse => {
  const authors = work.authorships.map((author) => ({
    orcid: author.author?.orcid ? getOrcidFromURL(author.author.orcid) : null,
    name: author.author.display_name,
    affiliations: author?.institutions.map((org) => ({ name: org.display_name, id: org?.ror || '' })) ?? [],
  }));

  const keywords = work?.keywords.map((entry) => entry.display_name) ?? [];

  const abstract = work?.abstract_inverted_index ? transformInvertedAbstractToText(work.abstract_inverted_index) : '';

  return { title: work.title, doi: work.doi, authors, pdfUrl: work.best_oa_location?.pdf_url, keywords, abstract };
};

export const transformInvertedAbstractToText = (abstract: OpenAlexWork['abstract_inverted_index']) => {
  const words = [];
  Object.entries(abstract).map(([word, positions]) => {
    positions.forEach((pos) => words.splice(pos, 0, word));
  });
  return words.filter(Boolean).join(' ');
};
