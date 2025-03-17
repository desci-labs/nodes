import { ResearchObjectV1 } from '@desci-labs/desci-models';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { default as Remixml } from 'remixml';
import { v4 } from 'uuid';
import { xml2json } from 'xml-js';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { ONE_DAY_TTL, getFromCache, setToCache } from '../../redisClient.js';
import { asyncMap } from '../../utils.js';

import { CrossRefHttpResponse, Items, QueryWorkParams, RegisterDoiResponse, Work } from './definitions.js';
import { ProfileSummary } from './types/summary.js';
import { WorksResponse } from './types/works.js';
import { keysToDotsAndDashses } from './utils.js';

const ORCID_PUBLIC_API = process.env.ORCID_PUBLIC_API || 'https://pub.sandbox.orcid.org/v3.0';

const logger = parentLogger.child({ module: '[CrossRefClient]' });

export const delay = async (timeMs: number) => {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
};

const metadataTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<doi_batch xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.crossref.org/schema/5.3.1 https://www.crossref.org/schemas/crossref5.3.1.xsd"
  xmlns="http://www.crossref.org/schema/5.3.1"
  xmlns:jats="http://www.ncbi.nlm.nih.gov/JATS1"
  xmlns:fr="http://www.crossref.org/fundref.xsd"
  xmlns:mml="http://www.w3.org/1998/Math/MathML" version="5.3.1">
  <head>
    <doi_batch_id>&_.batchId;</doi_batch_id>
    <timestamp>&_.timestamp;</timestamp>
    <depositor>
      <depositor_name>&depositor.name;</depositor_name>
      <email_address>&depositor.email;</email_address>
    </depositor>
    <registrant>&_.registrant;</registrant>
  </head>
  <body>
    <posted_content type="other">
      <group_title>&_.title;</group_title>
      <contributors>
        <for in="_.contributors" mkmapping="">
      <person_name sequence="&_.sequence;" contributor_role="author">
        <given_name>&_.name;</given_name>
        <surname>&_.surname;</surname>
        <if expr="_.affiliations">
          <affiliations>
            <for in="_.affiliations" mkmapping="">
              <institution>
                <institution_name>&_.name;</institution_name>
                <if expr="_.id">
                  <institution_id type="ror">&_.id;</institution_id>
                </if>
              </institution>
            </for>
          </affiliations>
        </if>
        <if expr="_.orcid">
          <if expr="_.isAuthenticated == true">
            <ORCID authenticated="true">&_.orcid;</ORCID>
          </if>
          <else>
            <ORCID authenticated="false">&_.orcid;</ORCID>
          </else>
        </if>
      </person_name>
    </for>
  </contributors>
  <titles>
    <title>&_.title;</title>
  </titles>
  <posted_date>
    <month>&publishedDate.month;</month>
    <day>&publishedDate.day;</day>
    <year>&publishedDate.year;</year>
  </posted_date>
  <acceptance_date>
    <month>&publishedDate.month;</month>
    <day>&publishedDate.day;</day>
    <year>&publishedDate.year;</year>
  </acceptance_date>
  <item_number>&_.dpid;</item_number>
  <doi_data>
    <doi>&_.doi;</doi>
    <resource>&_.doiResource;</resource>
  </doi_data>
</posted_content>
</body>
</doi_batch>
`;

type PublicationDate = {
  day: string;
  month: string;
  year: string;
};
/**
 * A wrapper http client for querying, caching and parsing requests
 * from the CrossRef Rest Api https://www.crossref.org/documentation/retrieve-metadata/rest-api/
 * Initialize constructor with CrossRef Api url https://api.crossref.org, Api token and a polite Mail
 */
class CrossRefClient {
  baseurl = 'https://api.crossref.org';

  constructor(
    private _plusToken?: string,
    private _mailto?: string,
  ) {}

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

  async registerDoi(query: {
    manifest: ResearchObjectV1;
    doi: string;
    dpid: string;
    publicationDate: PublicationDate;
  }): Promise<RegisterDoiResponse> {
    const contributors = await asyncMap(query.manifest.authors ?? [], async (author, index) => {
      const user = author.orcid ? await prisma.user.findUnique({ where: { orcid: author.orcid } }) : null;
      logger.info({ user: { orcid: user?.orcid } });
      const affiliations = user
        ? (
            await prisma.userOrganizations.findMany({ where: { userId: user.id }, include: { organization: true } })
          )?.map((org) => ({ name: org.organization.name, id: org.organization.id }))
        : author?.organizations?.map((org) => ({ name: org.name, id: org.id }));

      return {
        name: author.name.split(' ')[0],
        surname: author.name.split(' ').slice(1)?.join(' ') || '-',
        isAuthenticated: !!user,
        sequence: index === 0 ? 'first' : 'additional',
        // don't substitute with `sandbox.orcid.org`, the submission will be rejected
        // due to schema errors
        ...(author.orcid && {
          orcid: author.orcid.startsWith('https://orcid.org/') ? author.orcid : `https://orcid.org/${author.orcid}`,
        }),

        // crossref schema only allows a maximum of one affiliation per contributor
        ...(affiliations?.length > 0 && { affiliations: affiliations.slice(0, 1) }),
      };
    });

    const batchId = v4();

    const param = {
      _: {
        batchId,
        timestamp: Date.now(),
        dpid: query.dpid,
        doi: query.doi,
        doiResource: `${process.env.DPID_URL_OVERRIDE}/${query.dpid}`,
        title: query.manifest.title,
        registrant: 'DeSci Labs AG',
        contributors,
      },
      depositor: {
        name: 'DeSci Labs AG',
        email: process.env.CROSSREF_EMAIL,
      },
      publishedDate: query.publicationDate,
    };

    const metadata = Remixml.parse2txt(metadataTemplate, param);

    const url = `${process.env.CROSSREF_METADATA_API}?operation=doMDUpload&login_id=${process.env.CROSSREF_LOGIN}/dslb&login_passwd=${process.env.CROSSREF_PASSWORD}`;
    logger.info({ param, metadata, url }, 'METADATA TO POST');
    const buffer = Buffer.from(metadata, 'utf8');

    // prefix filename with `@` as seen from the crossref documentation
    // https://www.crossref.org/documentation/register-maintain-records/direct-deposit-xml/https-post/#00230
    const filename = `dpid_${param._.dpid}_upload.xml`;
    // save file for debugging purposes
    // await fs.writeFile(path.join(process.cwd(), filename), buffer);
    const form = new FormData();
    form.append('fname', filename);
    form.append('file', buffer, { filename });

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: form,
        headers: {
          Accept: '*/*',
        },
      });
      logger.info({ STATUS: response.status, message: response.statusText }, 'Response');
      const body = await response.text();
      logger.info({ body }, 'BODY');

      if (!response.ok || response.status !== 200) {
        // attach custom alert here
        logger.error(body, 'METADATA SUBMISSION ERROR');
        return { ok: false };
      }
      return { ok: true, batchId };
    } catch (error) {
      logger.error(error, 'Post metadata Api Error');
      return { ok: false };
    }
  }
  /**
   * Returns a list of all works (journal articles,
   * conference proceedings, books, components, etc),
   */
  async retrieveDoiMetadata(doi: string) {
    const params: { [k: string]: any } = {};
    let url = `https://www.crossref.org/openurl/?pid=${this._mailto}&format=unixref&id=${doi}`;
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
      const response = await global.fetch(request);
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

    const response = (await global.fetch(request)) as CrossRefHttpResponse<T>;
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

  async addSubmissiontoQueue({
    uniqueDoi,
    dpid,
    uuid,
    batchId,
  }: {
    uniqueDoi: string;
    dpid: string;
    uuid: string;
    batchId: string;
  }) {
    // check if there is no pending submission log
    return await prisma.doiSubmissionQueue.create({ data: { batchId, uniqueDoi, dpid, uuid } });
  }

  async retrieveSubmission(retrieveUrl: string) {
    try {
      logger.info({ retrieveUrl }, 'ATTEMPT TO RETRIEVE SUBMISSION');
      const response = await fetch(retrieveUrl);
      const contentType = response.headers.get('content-type');
      logger.info({ contentType }, 'RETRIEVE SUBMISSION');
      // handle when response is gone

      if (contentType === 'text/xml;charset=UTF-8') {
        // handle xml response
        const data = await response.text();
        const xmlPayload = xml2json(data);
        const result = JSON.parse(xmlPayload) as NotificationResultXmlJson;
        logger.info({ result }, 'PAYLOAD');
        const doi_batch_diagnostic = result?.elements?.[0];
        const batch_data = doi_batch_diagnostic.elements?.find((el) => el.name === 'batch_data');
        // const record_diagnostic = doi_batch_diagnostic.elements?.find((el) => el.name === 'record_diagnostic');
        const success = batch_data?.elements?.find((element) => element.name === 'success_count');
        const isSuccess = Number(success?.elements?.[0]?.text) > 0;
        return { success: isSuccess, failure: !isSuccess };
      } else {
        // handle json response
        const data = await response.text();
        logger.info({ data }, 'RESPONSE');
        let payload: NotificationResult;
        try {
          payload = JSON.parse(data) as NotificationResult;
          logger.info({ payload }, 'PAYLOAD');
        } catch (err) {
          logger.info({ err }, 'Cannot parse json body');
          payload = JSON.parse(data.substring(1, data.length - 1));
          logger.info({ payload }, 'PAYLOAD');
        }
        // return interprete the response from the api to determine if the
        // submission status has either `success | pending | failed`
        const isSuccess = payload?.completed !== null && !!payload?.recordCreated;
        return { success: isSuccess, failure: !isSuccess };
      }
    } catch (err) {
      logger.error({ err }, 'ERROR RETRIEVING SUBMISSION');
      return { success: false, failure: false };
    }
  }

  async searchWorks({ queryTitle }: QueryWorkParams) {
    const crossRefResponse = await fetch(
      `https://api.crossref.org/works?filter=has-full-text:true&mailto=sina@desci.com&query.title=${encodeURIComponent(
        queryTitle,
      )}&rows=3`,
      {
        headers: {
          Accept: '*/*',
        },
      },
    );

    if (crossRefResponse.ok) {
      const apiRes = (await crossRefResponse.json()) as Items<Work>;
      console.log('[api/publications/search.ts]', apiRes.status, apiRes?.message?.items?.length);
      const data = apiRes.message.items ?? []; // sort((a, b) => b['is-referenced-by-count'] - a['is-referenced-by-count'])?.[0];
      return data;
    } else {
      return [];
    }
  }

  async profileSummary(orcid: string) {
    try {
      const response = await fetch(`${ORCID_PUBLIC_API}/${orcid}`, {
        headers: {
          Accept: 'application/json',
        },
      });
      const profile = response.status === 200 ? ((await response.json()) as ProfileSummary) : undefined;

      const worksResponse = await fetch(`${ORCID_PUBLIC_API}/${orcid}/works`, {
        headers: {
          Accept: 'application/json',
        },
      });
      const works = worksResponse.status === 200 ? ((await worksResponse.json()) as WorksResponse) : undefined;

      return { profile, works };
    } catch (err) {
      logger.error({ err }, '[ORCID]::profileSummary');
      return { works: undefined, profile: undefined };
    }
  }
}

export default CrossRefClient;

type NotificationResult = {
  id: number;
  status: string;
  completed: string | null;
  serviced: string;
  notifyEndpoint: string;
  notifyPayloadId: string;
  notifyPayloadExpiration: string;
  internalTrackingId: string;
  externalTrackingId: string;
  recordCreated: string | null;
  recordUpdated: string | null;
};

interface NotificationResultXmlJson {
  elements: Array<{
    type: string;
    name: 'doi_batch_diagnostic';
    attributes: {
      status: 'completed';
      sp: 'a-cs1';
    };
    elements: Array<{
      type: 'element';
      name: 'batch_data';
      elements: Array<{
        type: 'element';
        name: 'success_count';
        elements: [
          {
            type: 'text';
            text: string;
          },
        ];
      }>;
    }>;
  }>;
}

// TODO: run yarn generate
