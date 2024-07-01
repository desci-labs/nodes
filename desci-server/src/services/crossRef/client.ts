import { ResearchObjectV1 } from '@desci-labs/desci-models';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { default as Remixml } from 'remixml';
import { v4 } from 'uuid';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { ONE_DAY_TTL, getFromCache, setToCache } from '../../redisClient.js';
import { asyncMap } from '../../utils.js';

import { CrossRefHttpResponse, Items, QueryWorkParams, RegisterDoiResponse, Work } from './definitions.js';
import { keysToDotsAndDashses } from './utils.js';

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
    <posted_content type="preprint">
      <group_title>&_.title;</group_title>
      <contributors>
        <for in="_.contributors" mkmapping="">
          <person_name sequence="first" contributor_role="author">
            <given_name>&_.name;</given_name>
            <surname>&_.surname;</surname>
            <if expr="_.affiliations">
              <affiliations>
                <for in="_.affiliations" mkmapping="">
                  <institution>
                    <institution_id type="ror">&_.id;</institution_id>
                  </institution>
                  <institution>
                    <institution_name>&_.name;</institution_name>
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

  // check if there's a pending submission for a dpid
  async getPendingSubmission(dpid: string) {
    // todo: retrieve doi whose submission log is pending
  }

  async registerDoi(query: {
    manifest: ResearchObjectV1;
    doi: string;
    publicationDate: PublicationDate;
  }): Promise<RegisterDoiResponse> {
    const contributors = await asyncMap(query.manifest.authors ?? [], async (author) => {
      const user = author.orcid ? await prisma.user.findUnique({ where: { orcid: author.orcid } }) : null;
      logger.info({ user: { orcid: user?.orcid } });
      const affiliations = user
        ? (
            await prisma.userOrganizations.findMany({ where: { userId: user.id }, include: { organization: true } })
          )?.map((org) => ({ name: org.organization.name, id: org.organization.id }))
        : author?.organizations?.map((org) => ({ name: org.name }));

      return {
        name: author.name.split(' ')[0],
        surname: author.name.split(' ').slice(1)?.join(' ') || '-',

        // don't substitute with `sandbox.orcid.org`, the submission will be rejected
        // due to schema errors
        orcid: `https://orcid.org/${author.orcid}`,

        isAuthenticated: !!user,
        // crossref schema only allows a maximum of one affiliation per contributor
        ...(affiliations?.length > 0 && { affiliations: affiliations.slice(0, 1) }),
      };
    });

    const batchId = v4();

    const param = {
      _: {
        batchId,
        timestamp: Date.now(),
        dpid: query.manifest.dpid.id,
        doi: query.doi,
        doiResource: `${process.env.DPID_URL_OVERRIDE}/${query.manifest.dpid.id}`,
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

    const url = `${process.env.CROSSREF_METADATA_API}?operation=doMDUpload&login_id=${process.env.CROSSREF_LOGIN || 'dslb'}&login_passwd=${process.env.CROSSREF_PASSWORD || 'pgz6wze1fmg-RPN_qkv'}`;
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
  async getDoiMetadata(doi: string) {
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

  async addSubmissiontoQueue({ doi, batchId }: { doi: number; batchId: string }) {
    // check if there is no pending submission log
    return await prisma.doiSubmissionQueue.create({ data: { doiRecordId: doi, batchId } });
  }

  async retrieveSubmission(retrieveUrl: string) {
    // retrieve submission log whose batchId == param.['CROSSREF-EXTERNAL-ID']
    // update with notifiication payload
    // query submssion payload from param.CROSSREF-RETRIEVE-URL
    // only create doi if submission status is success

    const response = (await fetch(retrieveUrl).then((res) => res.json())) as NotificationResult;
    logger.info(response, 'CROSSREF NOTIFICATION: retrieveSubmission');
    // return interprete the response from the api to determine if the
    // submission status has either `success | pending | failed`
    return { success: response?.completed !== null, pending: false, failure: true };
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

// TODO: run yarn generate
