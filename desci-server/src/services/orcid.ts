import { ResearchObjectV1, ResearchObjectV1Author } from '@desci-labs/desci-models';
import { AuthTokenSource, ORCIDRecord } from '@prisma/client';

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
    if (!process.env.ORCID_API_DOMAIN) throw new Error('[OrcidApiService]: ORCID_API_DOMAIN env is missing');
    this.baseUrl = `https://api.${process.env.ORCID_API_DOMAIN}/v3.0`;

    logger.info({ url: this.baseUrl }, 'Init ORCID Service');
  }

  private async getAccessToken(userId: number) {
    const authToken = await prisma.authToken.findFirst({
      where: {
        userId,
        source: AuthTokenSource.ORCID,
      },
    });
    if (!authToken) {
      throw new Error('User does not have an orcid auth token');
    }
    // todo: refresh token if necessary

    return authToken.accessToken;
  }

  async postWorkRecord(nodeUuid: string, orcid: string) {
    // TODO: get auth token from orcid profile
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

    const putCode = orcidPutCode?.putcode; // '1917594';;
    let data = generateWorkRecord({ manifest: latestManifest, nodeVersion, claims, putCode });
    data = data.replace(/\\"/g, '"');

    try {
      logger.info({ latestManifest, manifestCid, data }, 'WORK DATA');
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
        const location = response.headers.get('Location');
        let returnedCode = location?.split(' ')?.[1];

        if (!returnedCode) {
          const body = await response.text();
          const matches = body.match(PUTCODE_REGEX);
          logger.info({ matches, body }, 'Regex match');
          returnedCode = matches?.groups?.code || putCode;
        }

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
        logger.info({ nodeUuid, userId: user.id, status: response.status, returnedCode }, 'ORCID PROFILE UPDATED');
      } else {
        logger.info({ status: response.status, body: await response.text() }, 'ORCID API ERROR');
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
    ${manifest.description.trim() ? `<work:short-description>${manifest.description}</work:short-description>` : ''}
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
    .filter((component) => component.starred === true)
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
