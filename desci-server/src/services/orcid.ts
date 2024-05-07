import { ResearchObjectV1, ResearchObjectV1Author } from '@desci-labs/desci-models';
import { AuthTokenSource, ORCIDRecord } from '@prisma/client';

import { logger as parentLogger, prisma } from '../internal.js';
import { getIndexedResearchObjects } from '../theGraph.js';
import { hexToCid } from '../utils.js';

import { attestationService } from './Attestation.js';
import { getManifestByCid } from './data/processing.js';

const PUTCODE_REGEX = /put-code=.*?(?<code>\d+)/m;

const DPID_URL_OVERRIDE = process.env.DPID_URL_OVERRIDE || 'https://dev-beta.dpid.org';
const ORCID_DOMAIN = process.env.ORCID_API_DOMAIN || 'sandbox.orcid.org';
type Claim = Awaited<ReturnType<typeof attestationService.getProtectedNodeClaims>>[number];
const logger = parentLogger.child({ module: 'ORCIDApiService' });

class OrcidApiService {
  baseUrl: string;

  constructor() {
    if (!ORCID_DOMAIN) throw new Error('[OrcidApiService]: ORCID_API_DOMAIN env is missing');
    this.baseUrl = `https://api.${ORCID_DOMAIN}/v3.0`;

    logger.info({ url: this.baseUrl }, 'Init ORCID Service');
  }

  private async getAccessToken(userId: number) {
    let authToken = await prisma.authToken.findFirst({
      where: {
        userId,
        source: AuthTokenSource.ORCID,
      },
      orderBy: { updatedAt: 'desc' },
    });
    logger.info(authToken, 'AUTH TOKEN RETRIEVED');
    if (!authToken) {
      throw new Error('User does not have an orcid auth token');
    }

    // todo: refresh token if necessary
    try {
      const url = `https://${ORCID_DOMAIN}/oauth/token`;
      logger.info({ url }, 'REFRESH TOKEN');
      const response = await fetch(url, {
        method: 'post',
        body: `client_id=${process.env.ORCID_CLIENT_ID!}&client_secret=${process.env
          .ORCID_CLIENT_SECRET!}&grant_type=refresh_token&refresh_token=${authToken.refreshToken}&revoke_old=true`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (response.status === 200) {
        const data = (await response.json()) as {
          access_token: string;
          token_type: string;
          refresh_token: string;
          expires_in: number;
          scope: string;
          name: string;
          orcid: string;
        };
        authToken = await prisma.authToken.upsert({
          where: { id: authToken.id },
          update: { refreshToken: data.refresh_token, expiresIn: data.expires_in, accessToken: data.access_token },
          create: {
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            accessToken: data.access_token,
            source: AuthTokenSource.ORCID,
            userId: authToken.userId,
          },
        });
      }
      logger.info({ status: response.status, statusText: response.statusText }, 'REFRESH TOKEN RESPONSE');
    } catch (err) {
      logger.info({ err }, 'ORCID REFRESH TOKEN ERROR');
    }

    return authToken.accessToken;
  }

  async postWorkRecord(nodeUuid: string, orcid: string) {
    try {
      const user = await prisma.user.findUnique({ where: { orcid } });
      const authToken = await this.getAccessToken(user.id);
      const orcidPutCode = await prisma.orcidPutCodes.findFirst({
        where: { uuid: nodeUuid, orcid, userId: user.id, record: ORCIDRecord.WORK },
      });

      const { researchObjects } = await getIndexedResearchObjects([nodeUuid]);
      const researchObject = researchObjects[0];
      const manifestCid = hexToCid(researchObject.recentCid);
      const latestManifest = await getManifestByCid(manifestCid);
      const nodeVersion = researchObject.versions.length;
      let claims = await attestationService.getProtectedNodeClaims(latestManifest.dpid.id);
      claims = claims.filter((claim) => claim.verifications > 0);

      const putCode = orcidPutCode?.putcode;
      let data = generateWorkRecord({ manifest: latestManifest, nodeVersion, claims, putCode });
      data = data.replace(/\\"/g, '"');

      const url = `${this.baseUrl}/${orcid}/work${putCode ? '/' + putCode : ''}`;
      const method = putCode ? 'PUT' : 'POST';
      logger.info({ latestManifest, manifestCid, data, orcidPutCode, putCode, url, method }, 'WORK DATA');
      const response = await fetch(url, {
        method,
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
          status: response.status,
          statusText: response.statusText,
          putCode,
          nodeUuid,
          claims: claims.length,
          orcid,
        },
        'ORCID API RESPONSE',
      );

      if ([200, 201].includes(response.status)) {
        const location = response.headers.get('Location')?.split('/');
        const returnedCode = location?.[location.length - 1];
        response.headers.forEach((header, key) => logger.info({ key, header }, 'Response header'));
        logger.info({ location }, 'RESPONSE HEADER Location');

        if (returnedCode) {
          await prisma.orcidPutCodes.upsert({
            where: {
              orcid_record_uuid: {
                orcid,
                record: ORCIDRecord.WORK,
                uuid: nodeUuid,
              },
            },
            update: {
              orcid,
              uuid: nodeUuid,
              putcode: returnedCode,
              record: ORCIDRecord.WORK,
            },
            create: {
              orcid,
              uuid: nodeUuid,
              userId: user.id,
              putcode: returnedCode,
              record: ORCIDRecord.WORK,
            },
          });
        }

        logger.info({ nodeUuid, userId: user.id, status: response.status, returnedCode }, 'ORCID PROFILE UPDATED');
      } else {
        logger.info({ status: response.status, response, body: await response.text() }, 'ORCID API ERROR');
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
  const codeAttr = putCode ? 'put-code="' + putCode + '"' : '';
  logger.info({ codeAttr }, 'CODE ATTR');
  return (
    '<work:work xmlns:common="http://www.orcid.org/ns/common" xmlns:work="http://www.orcid.org/ns/work" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.orcid.org/ns/work https://raw.githubusercontent.com/ORCID/orcid-model/master/src/main/resources/record_3.0/work-3.0.xsd" ' +
    codeAttr +
    '> ' +
    '<work:title>' +
    `<common:title>${manifest.title}</common:title>
    </work:title>
    ${manifest?.description?.trim() ? `<work:short-description>${manifest.description}</work:short-description>` : ''}
    <work:type>data-set</work:type>
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
  const dataRoot = `${DPID_URL_OVERRIDE}/${manifest.dpid.id}/v${version}/root`;
  const externalIdPath = `<common:external-ids>
  <common:external-id>
            <common:external-id-type>uri</common:external-id-type>
            <common:external-id-value>${dataRoot}</common:external-id-value>
            <common:external-id-url>${dataRoot}</common:external-id-url>
            <common:external-id-relationship>self</common:external-id-relationship>
        </common:external-id>
  ${manifest.components
    .filter((component) => component.starred === true)
    .map((component) => {
      const url = `${DPID_URL_OVERRIDE}/${manifest.dpid.id}/v${version}/${component.payload?.path ?? ''}`;
      return `<common:external-id>
            <common:external-id-type>uri</common:external-id-type>
            <common:external-id-value>${url}</common:external-id-value>
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
            <common:external-id-value>${claim.name} by ${claim.community} on DPID://${manifest.dpid.id}</common:external-id-value>
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
                <common:uri>https://${ORCID_DOMAIN}/${author.orcid}</common:uri>
                <common:path>${author.orcid}</common:path>
                <common:host>${ORCID_DOMAIN}</common:host>
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
