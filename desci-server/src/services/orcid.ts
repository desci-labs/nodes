// expose Orcid api class
// init http client with default headers and api key
// expose api for adding work record to researchers orcid profile
// save put key in node table
// expose api to update orcid record

import { ResearchObjectV1, ResearchObjectV1Author, ResearchObjectV1AuthorRole } from '@desci-labs/desci-models';
import axios, { AxiosInstance } from 'axios';

import { logger as parentLogger, prisma } from '../internal.js';
import { getIndexedResearchObjects } from '../theGraph.js';
import { hexToCid } from '../utils.js';

import { attestationService } from './Attestation.js';
import { getManifestByCid } from './data/processing.js';

const PUTCODE_REGEX = /put-code=.*?(?<code>\d+)/m;

type Claim = Awaited<ReturnType<typeof attestationService.getProtectedNodeClaims>>[number];
const logger = parentLogger.child({ module: 'ORCIDApiService' });

class OrcidApiService {
  baseUrl: string;

  constructor() {
    if (!process.env.ORCID_API_DOMAIN) throw new Error('[ORCID SERVICE]: ORCID_API_DOMAIN env is missing');

    // this.#apiKey = process.env.ORCID_API_SECRET;
    this.baseUrl = `https://api.${process.env.ORCID_API_DOMAIN}/v3.0`;

    logger.info({ url: this.baseUrl }, 'Init ORCID Service');
  }

  private async getAccessToken(orcid: string) {
    const profile = await prisma.orcidProfile.findUnique({ where: { orcidId: orcid }, select: { expiresIn: true } });
    // check if token has expired, refresh

    const token = 'b527e775-aac0-4e19-bc80-fa830e674b97';

    return token;
  }

  async postWorkRecord(nodeUuid: string, orcid: string) {
    // TODO: get auth token from orcid profile
    // todo: refresh token if necessary
    const authToken = await this.getAccessToken(orcid);

    const { researchObjects } = await getIndexedResearchObjects([nodeUuid]);
    const researchObject = researchObjects[0];
    const manifestCid = hexToCid(researchObject.recentCid);
    const latestManifest = await getManifestByCid(manifestCid);
    const nodeVersion = researchObject.versions.length;
    const claims = await attestationService.getProtectedNodeClaims(latestManifest.dpid.id);
    // logger.info({ researchObject, manifestCid, latestManifest, nodeVersion, claims }, 'POST WORK RECORD');
    // check if node (user) table has existing orcidPutCode
    const putCode = '1917594';

    let data = generateWorkRecord({ manifest: latestManifest, nodeVersion, claims, putCode });
    data = data.replace(/\\"/g, '"');
    logger.info({ data }, 'REQUEST BODY');

    try {
      const response = await fetch(`${this.baseUrl}/${orcid}/work${putCode ? '/' + putCode : ''}`, {
        method: putCode ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/xml',
          Accept: '*/*',
          'Access-Control-Expose-Headers': 'Content-Disposition',
        },
        body: data,
      });

      logger.info(
        {
          // headers: ,
          status: response.status,
          statusText: response.statusText,
          putCode,
          nodeUuid,
          claims: claims.length,
          orcid,
        },
        'orcid api response',
      );

      const location = response.headers.get('Location');
      let returnedCode = location?.split(' ')?.[1];

      if (!returnedCode) {
        const body = await response.text();
        const matches = body.match(PUTCODE_REGEX);
        logger.info({ matches }, 'Regex match');
        returnedCode = matches.groups?.code;
      }

      if (response.status === 201) {
        // todo: INSERT put-code into node table
        logger.info({ status: response.status, returnedCode }, 'ORCID PROFILE CREATED');
      } else if (response.status === 200) {
        logger.info({ status: response.status, returnedCode }, 'ORCID PROFILE UPDATED');
      }
    } catch (err) {
      logger.info({ err }, 'Error Response');
    }
  }
}

const orcidApiService = new OrcidApiService();
export default orcidApiService;

const generateWorkRecord = ({
  manifest,
  nodeVersion,
  putCode,
  claims,
}: {
  manifest: ResearchObjectV1;
  nodeVersion: number;
  claims: Claim[];
  putCode?: string;
}) => {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><work:work xmlns:common="http://www.orcid.org/ns/common" xmlns:work="http://www.orcid.org/ns/work" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.orcid.org/ns/work /work-3.0.xsd" put-code="' +
    putCode +
    '" > ' +
    '<work:title>' +
    `<common:title>${manifest.title}</common:title>
    </work:title>
    <work:type>data-set</work:type>
    ${manifest.description ? `<work:short-description>${manifest.description}</work:short-description>` : ''}
    ${generateExternalIds({ manifest, claims, version: nodeVersion })}
    ${generateContributors(manifest.authors ?? [])}
    </work:work>
    `
  );
};

const generateExternalIds = ({
  manifest,
  version,
  claims,
}: {
  version: number;
  manifest: ResearchObjectV1;
  claims: Claim[];
}) => {
  const externalIdPath = `<common:external-ids>${manifest.components
    .map((component) => {
      const url = `${process.env.DPID_URL_OVERRIDE}/${manifest.dpid.id}/v${version}/${component.payload?.path ?? ''}`;
      const title = component.payload?.title || component.name;
      return `<common:external-id>
            <common:external-id-type>uri</common:external-id-type>
            <common:external-id-value>${title}</common:external-id-value>
            <common:external-id-url>${url}</common:external-id-url>
            <common:external-id-relationship>self</common:external-id-relationship>
        </common:external-id>`;
    })
    .join(' ')}
    ${claims
      .map((claim) => {
        const url = `${process.env.DAPP_URL}/dpid/${manifest.dpid.id}?claim=${claim.id}`;

        return `<common:external-id>
            <common:external-id-type>uri</common:external-id-type>
            <common:external-id-value>${claim.name} by ${claim.community}</common:external-id-value>
            <common:external-id-url>${url}</common:external-id-url>
            <common:external-id-relationship>self</common:external-id-relationship>
        </common:external-id>`;
      })
      .join(' ')}</common:external-ids>`;

  return externalIdPath;
};

const generateContributors = (authors: ResearchObjectV1Author[]) => {
  const contributors =
    authors?.length > 0
      ? `<work:contributors>
    ${authors
      .map((author, idx) => {
        return `<work:contributor>
            ${
              author.orcid
                ? `<common:contributor-orcid>
                <common:uri>https://${process.env.ORCID_API_DOMAIN}/${author.orcid}</common:uri>
                <common:path>${author.orcid}</common:path>
                <common:host>${process.env.ORCID_API_DOMAIN}</common:host>
              </common:contributor-orcid>`
                : ``
            }
            <work:credit-name>${author.name}</work:credit-name>
            <work:contributor-attributes>
                <work:contributor-sequence>${idx === 0 ? 'first' : 'additional'}</work:contributor-sequence>
                <work:contributor-role>author</work:contributor-role>
            </work:contributor-attributes>
        </work:contributor>`;
      })
      .join(' ')}
  </work:contributors>`
      : ``;
  return contributors;
};
