import { ResearchObjectV1, ResearchObjectV1Author } from '@desci-labs/desci-models';
import { ActionType, AuthTokenSource, ORCIDRecord, OrcidPutCodes, PutcodeReference } from '@prisma/client';

import { logger as parentLogger, prisma } from '../internal.js';
import { IndexedResearchObject, getIndexedResearchObjects } from '../theGraph.js';
import { hexToCid } from '../utils.js';

import { attestationService } from './Attestation.js';
import { getManifestByCid } from './data/processing.js';
import { saveInteractionWithoutReq } from './interactionLog.js';

// const PUTCODE_REGEX = /put-code=.*?(?<code>\d+)/m;

const DPID_URL_OVERRIDE = process.env.DPID_URL_OVERRIDE || 'https://beta.dpid.org';
const ORCID_DOMAIN = process.env.ORCID_API_DOMAIN || 'sandbox.orcid.org';
type Claim = Awaited<ReturnType<typeof attestationService.getProtectedNodeClaims>>[number];
const logger = parentLogger.child({ module: 'ORCIDApiService' });

/**
 * Service class for interfacing with ORCID /works API
 * Handles updating orcid work profile entries for users with orcid
 * linked to their profiles
 */
class OrcidApiService {
  baseUrl: string;

  constructor() {
    if (!ORCID_DOMAIN) throw new Error('[OrcidApiService]: ORCID_API_DOMAIN env is missing');
    this.baseUrl = `https://api.${ORCID_DOMAIN}/v3.0`;

    logger.info({ url: this.baseUrl }, 'Init ORCID Service');
  }

  /**
   * Query user orcid access token from the database and refreshes
   * tokens if needed and update database entry valid token
   * @param userId unique user identifier
   * @returns a valid access token string
   */
  private async getAccessToken(userId: number) {
    const authTokens = await prisma.authToken.findMany({
      where: {
        userId,
        source: AuthTokenSource.ORCID,
      },
      orderBy: { updatedAt: 'desc' },
    });
    let authToken = authTokens[0];
    logger.info(
      { tokenDate: authToken.createdAt, updatedAt: authToken.updatedAt, tokenLength: authTokens.length },
      'AUTH TOKEN RETRIEVED',
    );
    if (!authToken) {
      throw new Error('User does not have an orcid auth token');
    }

    // todo: refresh token if necessary
    try {
      const url = `https://${ORCID_DOMAIN}/oauth/token`;

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
        logger.info(
          {
            status: response.status,
            statusText: response.statusText,
            data: {
              name: data.name,
              scope: data.scope,
              token_type: data.token_type,
              orcid: data.orcid,
              refreshToken: !!data.refresh_token,
              accessToken: !!data.access_token,
            },
          },
          'REFRESH TOKEN RESPONSE',
        );
      } else {
        logger.info(
          { status: response.status, statusText: response.statusText, BODY: await response.json() },
          'REFRESH TOKEN ERROR',
        );
      }
    } catch (err) {
      logger.info({ err }, 'ORCID REFRESH TOKEN ERROR');
    }

    return authToken.accessToken;
  }

  /**
   * Remove an attestation from user's ORCID work profile
   * If user has no verified protected attestations, remove research node
   * work entry
   * @param {Object} argument - The claim argument to process
   * @param {number} argument.claimId - The ID of the node attestation to remove
   * @param {string} argument.nodeUuid - The uuid of the research node
   * @param {string} argument.orcid - The ORCID identifier of the user
   * @returns
   */
  async removeClaimRecord({ claimId, nodeUuid, orcid }: { claimId: number; nodeUuid: string; orcid: string }) {
    const putCode = await prisma.orcidPutCodes.findFirst({
      where: {
        claimId,
        uuid: nodeUuid,
        orcid,
      },
    });

    if (!putCode) return;

    const user = await prisma.user.findUnique({ where: { orcid } });
    const authToken = await this.getAccessToken(user.id);
    logger.info({ userId: user.id, authToken: !!authToken, nodeUuid }, '[ORCID::DELETE]:: START');

    await this.removeWorkRecord({ orcid, putCode, authToken });

    const { researchObjects } = await getIndexedResearchObjects([nodeUuid]);
    const researchObject = researchObjects[0] as IndexedResearchObject;
    const manifestCid = hexToCid(researchObject.recentCid);
    const latestManifest = await getManifestByCid(manifestCid);
    let claims = await attestationService.getProtectedNodeClaims(latestManifest.dpid.id);
    claims = claims.filter((claim) => claim.verifications > 0);
    logger.info({ claims: claims.length }, '[ORCID::DELETE]:: CHECK CLAIMS');

    if (claims.length === 0) {
      const nodePutCode = await prisma.orcidPutCodes.findUnique({
        where: {
          orcid_uuid_reference: {
            orcid,
            uuid: nodeUuid,
            reference: PutcodeReference.PREPRINT,
          },
        },
      });

      if (!nodePutCode) return;
      logger.info({ nodePutCode }, '[ORCID::DELETE]:: REMOVE NODE RECORD');
      await this.removeWorkRecord({ orcid, putCode: nodePutCode, authToken });
    }

    logger.info({ userId: user.id, CLAIMS: claims.length, nodeUuid }, '[ORCID::DELETE]:: FINISH');
  }

  /**
   * Execute http request to remove ORCID work entry
   * and remove the associated putCode from the database
   * @param {Object} argument - The claim argument to process
   * @param {string} argument.orcid - The ORCID identifier of the user
   * @param {number} argument.putCode - The ORCID /work record putCode
   * @param {string} argument.authToken - A valid user orcid access token
   * @returns
   */
  async removeWorkRecord({ putCode, authToken, orcid }: { orcid: string; putCode: OrcidPutCodes; authToken: string }) {
    const code = putCode.putcode;
    const url = `${this.baseUrl}/${orcid}/work${code ? '/' + code : ''}`;
    logger.info(
      {
        code,
        orcid,
      },
      'ORCID API DELETE RECORD',
    );
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/xml',
        Accept: '*/*',
        'Access-Control-Expose-Headers': 'Content-Disposition',
      },
    });

    if (response.ok) {
      await saveInteractionWithoutReq(ActionType.REMOVE_ORCID_WORK_RECORD, {
        orcid,
      });
      await prisma.orcidPutCodes.delete({
        where: {
          id: putCode.id,
        },
      });

      logger.info(
        {
          status: response.status,
          statusText: response.statusText,
          orcid,
          putCode: {
            code: putCode.putcode,
            reference: putCode.reference,
          },
        },
        'ORCID RECORD DELETED',
      );
    } else {
      await saveInteractionWithoutReq(ActionType.ORCID_API_ERROR, {
        orcid,
        putCode,
        status: response.status,
        error: await response.json(),
      });
      logger.error({ orcid, putCode, status: response.status }, 'Error: REMOVE ORCID WORK RECORD');
    }
  }

  /**
   * Update ORCID work summary of a user
   * Retrieve a validated protected attestations and post each as a work entry
   * Retrieve Research Node with uuid {nodeUuid} and post a work entry
   * @param nodeUuid - Research node uuid
   * @param orcid - ORCID identifier
   * @returns
   */
  async postWorkRecord(nodeUuid: string, orcid: string) {
    try {
      const user = await prisma.user.findUnique({ where: { orcid } });
      const authToken = await this.getAccessToken(user.id);

      const { researchObjects } = await getIndexedResearchObjects([nodeUuid]);
      const researchObject = researchObjects[0] as IndexedResearchObject;
      const manifestCid = hexToCid(researchObject.recentCid);
      const latestManifest = await getManifestByCid(manifestCid);
      researchObject.versions.reverse();
      const nodeVersion = researchObject.versions.length;

      let claims = await attestationService.getProtectedNodeClaims(latestManifest.dpid.id);
      claims = claims.filter((claim) => claim.verifications > 0);

      // TODO: if claims is empty remove orcid record
      if (claims.length === 0) return;

      const latestVersion = researchObject.versions[researchObject.versions.length - 1];
      const publicationDate = new Date(parseInt(latestVersion.time) * 1000).toLocaleDateString().replaceAll('/', '-');
      const contributorsXml = generateContributors(latestManifest.authors ?? [], orcid);
      const nodeRecordPromise = this.putNodeWorkRecord({
        orcid,
        authToken,
        uuid: nodeUuid,
        nodeVersion,
        publicationDate,
        contributorsXml,
        userId: user.id,
        manifest: latestManifest,
      });
      const claimRecordPromises = claims.map((claim) => {
        const claimedVersionNumber = claims[claims.length - 1].nodeVersion;
        const claimedVersion = researchObject.versions[claimedVersionNumber];
        const publicationDate = new Date(parseInt(claimedVersion.time) * 1000)
          .toLocaleDateString()
          .replaceAll('/', '-');
        return this.putClaimWorkRecord({
          claim,
          publicationDate,
          orcid,
          authToken,
          contributorsXml,
          uuid: nodeUuid,
          userId: user.id,
          nodeVersion: claimedVersionNumber,
          manifest: latestManifest,
        });
      });

      await Promise.all([nodeRecordPromise, ...claimRecordPromises]);
    } catch (err) {
      logger.info({ err }, 'Error Response');
    }
  }

  /**
   * Execute http request to post/update ORCID work entry for a node
   * and insert/update the associated putCode in the database
   * @param {Object} argument - The Research Node details object
   * @param {Object} argument.manifest - The node's manifest
   * @param {string} argument.publicationDate - The last publish datetime string in rfc3339 format
   * @param {string} argument.uuid - Unique uuid identifier of the node to update
   * @param {number} argument.userId - ID of the user (node owner)
   * @param {string} argument.authToken - A valid user orcid access token
   * @param {string} argument.orcid - The ORCID identifier of the user
   * @param {number} argument.nodeVersion - The latest version of the research node
   */
  async putNodeWorkRecord({
    manifest,
    publicationDate,
    uuid,
    userId,
    authToken,
    orcid,
    nodeVersion,
    contributorsXml,
  }: {
    manifest: ResearchObjectV1;
    publicationDate: string;
    uuid: string;
    userId: number;
    authToken: string;
    orcid: string;
    nodeVersion: number;
    contributorsXml: string;
  }) {
    try {
      const orcidPutCode = await prisma.orcidPutCodes.findUnique({
        where: { orcid_uuid_reference: { orcid, uuid, reference: PutcodeReference.PREPRINT } },
      });
      const putCode = orcidPutCode?.putcode;

      let data = generateNodeWorkRecord({ manifest, publicationDate, nodeVersion, putCode, contributorsXml });
      data = data.replace(/\\"/g, '"');

      const url = `${this.baseUrl}/${orcid}/work${putCode ? '/' + putCode : ''}`;
      const method = putCode ? 'PUT' : 'POST';
      logger.info({ data, putCode, url, method }, '[ORCID_API_SERVICE]:: WORK DATA');

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
          uuid,
          orcid,
        },
        'ORCID API RESPONSE',
      );

      if ([200, 201].includes(response.status)) {
        const location = response.headers.get('Location')?.split('/');
        const returnedCode = location?.[location.length - 1];
        // response.headers.forEach((header, key) => logger.info({ key, header }, 'Response header'));
        logger.info({ location }, 'RESPONSE HEADER Location');

        if (returnedCode) {
          await prisma.orcidPutCodes.upsert({
            where: {
              orcid_uuid_reference: { orcid, uuid, reference: PutcodeReference.PREPRINT },
            },
            update: {
              putcode: returnedCode,
            },
            create: {
              orcid,
              uuid,
              userId,
              putcode: returnedCode,
              record: ORCIDRecord.WORK,
              reference: PutcodeReference.PREPRINT,
            },
          });
        }
        await saveInteractionWithoutReq(ActionType.UPDATE_ORCID_RECORD, {
          userId,
          orcid,
          uuid,
          putCode: returnedCode,
        });
        logger.info(
          { uuid, userId, status: response.status, returnedCode, reference: PutcodeReference.PREPRINT },
          '[ORCID_API_SERVICE]:: Node Record UPDATED',
        );
      } else {
        const body = await response.text();
        await saveInteractionWithoutReq(ActionType.ORCID_API_ERROR, {
          userId,
          orcid,
          uuid,
          statusCode: response.status,
          error: body,
        });
        logger.info({ status: response.status, response, body }, '[ORCID_API_SERVICE]::ORCID NODE API ERROR');
      }
    } catch (err) {
      await saveInteractionWithoutReq(ActionType.ORCID_API_ERROR, {
        userId,
        orcid,
        uuid,
        error: err,
      });
      logger.info({ err }, '[ORCID_API_SERVICE]::NODE API Error Response');
    }
  }

  /**
   * Execute http request to post/update ORCID work entry for an attestation
   * and insert/update the associated putCode in the database
   * @param {Object} argument - The Research Node details object
   * @param {string} argument.authToken - A valid user orcid access token
   * @param {Object} argument.claim - The claim object retrieved from the database
   * @param {Object} argument.manifest - The node's manifest
   * @param {number} argument.nodeVersion - The latest version of the research node
   * @param {string} argument.orcid - The ORCID identifier of the user
   * @param {string} argument.publicationDate - The last publish datetime string in rfc3339 format
   * @param {string} argument.uuid - Unique uuid identifier of the node to update
   * @param {number} argument.userId - ID of the user (node owner)
   */
  async putClaimWorkRecord({
    manifest,
    publicationDate,
    uuid,
    userId,
    authToken,
    orcid,
    claim,
    nodeVersion,
    contributorsXml,
  }: {
    claim: Claim;
    contributorsXml: string;
    manifest: ResearchObjectV1;
    nodeVersion: number;
    publicationDate: string;
    uuid: string;
    userId: number;
    authToken: string;
    orcid: string;
  }) {
    try {
      const putCodeReference = claim.name.toLowerCase().includes('code')
        ? PutcodeReference.SOFTWARE
        : claim.name.toLowerCase().includes('data')
          ? PutcodeReference.DATASET
          : PutcodeReference.PREPRINT;

      const orcidPutCode = await prisma.orcidPutCodes.findUnique({
        where: { orcid_uuid_reference: { orcid, uuid, reference: putCodeReference } },
      });
      const putCode = orcidPutCode?.putcode;

      let data = generateClaimWorkRecord({
        nodeVersion,
        manifest,
        publicationDate,
        claim,
        putCode,
        contributorsXml,
      });
      data = data.replace(/\\"/g, '"');

      const url = `${this.baseUrl}/${orcid}/work${putCode ? '/' + putCode : ''}`;
      const method = putCode ? 'PUT' : 'POST';
      logger.info(
        { putCodeReference, claim: claim.name, putCode, url, method, data },
        '[ORCID_API_SERVICE]::CLAIM DATA',
      );

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
          uuid,
          orcid,
        },
        'ORCID CLAIM API RESPONSE',
      );

      if ([200, 201].includes(response.status)) {
        const location = response.headers.get('Location')?.split('/');
        const returnedCode = location?.[location.length - 1];
        // response.headers.forEach((header, key) => logger.info({ key, header }, 'Response header'));
        logger.info({ location }, 'RESPONSE HEADER Location');

        if (returnedCode) {
          await prisma.orcidPutCodes.upsert({
            where: {
              orcid_uuid_reference: { orcid, uuid, reference: putCodeReference },
            },
            update: {
              putcode: returnedCode,
            },
            create: {
              orcid,
              uuid,
              userId,
              claimId: claim.id,
              putcode: returnedCode,
              record: ORCIDRecord.WORK,
              reference: putCodeReference,
            },
          });
        }

        await saveInteractionWithoutReq(ActionType.UPDATE_ORCID_RECORD, {
          userId,
          orcid,
          uuid,
          claimId: claim.id,
          putCode: returnedCode,
        });

        logger.info(
          { uuid, claimId: claim.id, userId, status: response.status, returnedCode, reference: putCodeReference },
          'ORCID CLAIM RECORD UPDATED',
        );
      } else {
        const body = await response.text();
        await saveInteractionWithoutReq(ActionType.ORCID_API_ERROR, {
          userId,
          orcid,
          uuid,
          claimId: claim.id,
          statusCode: response.status,
          error: body,
        });
        logger.info({ status: response.status, response, body }, '[ORCID_API_SERVICE]::ORCID CLAIM API ERROR');
      }
    } catch (err) {
      await saveInteractionWithoutReq(ActionType.ORCID_API_ERROR, {
        userId,
        orcid,
        uuid,
        claimId: claim.id,
        error: err,
      });
      logger.info({ err }, '[ORCID_API_SERVICE]::CLAIM API Error Response');
    }
  }
}

/**
 * Generate an ORCID work summary xml string based for an attestation/claim
 * Model Reference https://github.com/ORCID/orcid-model/blob/master/src/main/resources/record_3.0/work-3.0.xsd
 * @param {Object} argument - The Research Node details object
 * @param {Object} argument.claim - The claim object retrieved from the database
 * @param {Object} argument.manifest - The node's manifest
 * @param {number} argument.nodeVersion - The latest version of the research node
 * @param {string} argument.publicationDate - The last publish datetime string in rfc3339 format
 * @param {number=} argument.putCode - The ORCID /work record putCode
 */
const generateClaimWorkRecord = ({
  manifest,
  putCode,
  claim,
  nodeVersion,
  publicationDate,
  contributorsXml,
}: {
  manifest: ResearchObjectV1;
  claim: Claim;
  contributorsXml: string;
  putCode?: string;
  nodeVersion: number;
  publicationDate: string;
}) => {
  const codeAttr = putCode ? 'put-code="' + putCode + '"' : '';
  const workType = claim.name.toLowerCase().includes('code')
    ? 'software'
    : claim.name.toLowerCase().includes('data')
      ? 'data-set'
      : 'preprint';

  const description = `${claim.name} availability verified`;
  const [month, day, year] = publicationDate.split('-');
  const externalUrl = `${DPID_URL_OVERRIDE}/${manifest.dpid.id}/v${nodeVersion}/attestation/${claim.id}`;
  const dataRoot = `${DPID_URL_OVERRIDE}/${manifest.dpid.id}/v${nodeVersion}`;
  logger.info({ codeAttr, workType, publicationDate, day, month, year, externalUrl }, 'CODE ATTR');
  return (
    '<work:work xmlns:common="http://www.orcid.org/ns/common" xmlns:work="http://www.orcid.org/ns/work" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.orcid.org/ns/work https://raw.githubusercontent.com/ORCID/orcid-model/master/src/main/resources/record_3.0/work-3.0.xsd" ' +
    codeAttr +
    '> ' +
    '<work:title>' +
    ` <common:title>${manifest.title}</common:title>
    </work:title>
    <work:short-description>${description}</work:short-description>
    <work:type>${workType}</work:type>
    <common:publication-date>
           <common:year>${year}</common:year>
           <common:month>${zeropad(month)}</common:month>
           <common:day>${zeropad(day)}</common:day>
    </common:publication-date>
    <common:external-ids>
      <common:external-id>
        <common:external-id-type>uri</common:external-id-type>
        <common:external-id-value>${claim.name} Root ${dataRoot}</common:external-id-value>
        <common:external-id-url>${dataRoot}</common:external-id-url>
        <common:external-id-relationship>self</common:external-id-relationship>
      </common:external-id>
      <common:external-id>
            <common:external-id-type>uri</common:external-id-type>
            <common:external-id-value>${externalUrl}</common:external-id-value>
            <common:external-id-url>${externalUrl}</common:external-id-url>
            <common:external-id-relationship>part-of</common:external-id-relationship>
        </common:external-id>
    </common:external-ids>
    <common:url>${externalUrl}</common:url>
    ${contributorsXml}
    </work:work>
    `
  );
};

const zeropad = (data: string) => (data.length < 2 ? `0${data}` : data);

/**
 * Generate an ORCID work summary xml string based for a research Node
 * Model Reference https://github.com/ORCID/orcid-model/blob/master/src/main/resources/record_3.0/work-3.0.xsd
 * @param {Object} argument - The Research Node details object
 * @param {Object} argument.manifest - The node's manifest
 * @param {number} argument.nodeVersion - The latest version of the research node
 * @param {string} argument.publicationDate - The last publish datetime string in rfc3339 format
 * @param {number=} argument.putCode - The ORCID /work record putCode
 * @returns {string}  xml string of the constructed work summary data
 */
const generateNodeWorkRecord = ({
  manifest,
  nodeVersion,
  putCode,
  publicationDate,
  contributorsXml,
}: {
  manifest: ResearchObjectV1;
  nodeVersion: number;
  putCode?: string;
  publicationDate: string;
  contributorsXml: string;
}): string => {
  const codeAttr = putCode ? 'put-code="' + putCode + '"' : '';
  const workType = 'preprint';
  const [month, day, year] = publicationDate.split('-');
  const dataRoot = `${DPID_URL_OVERRIDE}/${manifest.dpid.id}/v${nodeVersion}`;
  logger.info({ codeAttr, publicationDate, dataRoot }, 'CODE ATTR');
  return (
    '<work:work xmlns:common="http://www.orcid.org/ns/common" xmlns:work="http://www.orcid.org/ns/work" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.orcid.org/ns/work https://raw.githubusercontent.com/ORCID/orcid-model/master/src/main/resources/record_3.0/work-3.0.xsd" ' +
    codeAttr +
    '> ' +
    '<work:title>' +
    ` <common:title>${manifest.title}</common:title>
    </work:title>
    <work:type>${workType}</work:type>
    <common:publication-date>
      <common:year>${year}</common:year>
      <common:month>${zeropad(month)}</common:month>
      <common:day>${zeropad(day)}</common:day>
    </common:publication-date>
    <common:external-ids>
      <common:external-id>
        <common:external-id-type>uri</common:external-id-type>
        <common:external-id-value>${dataRoot}</common:external-id-value>
        <common:external-id-url>${dataRoot}</common:external-id-url>
        <common:external-id-relationship>self</common:external-id-relationship>
      </common:external-id>
    </common:external-ids>
    <common:url>${dataRoot}</common:url>
    ${contributorsXml}
    </work:work>
    `
  );
};

/**
 * Generate an ORCID work contributors xml string
 * Model Reference https://github.com/ORCID/orcid-model/blob/master/src/main/resources/record_3.0/work-3.0.xsd#L160
 * @param authors[] - A list of ResearchObjectV1Author entries
 * @returns {string} xml string of the constructed contributor data
 */
const generateContributors = (authors: ResearchObjectV1Author[], ownerOrcid: string): string => {
  authors.reverse();

  const authorIndex = authors.findIndex((author) => author.orcid === ownerOrcid);
  if (authorIndex !== -1 && authorIndex !== 0) {
    const mainAuthor = authors.splice(authorIndex, 1);
    authors.unshift(mainAuthor[0]);
  }

  const contributors =
    authors?.length > 0
      ? `<work:contributors>
    ${authors
      .filter((author) => !!author.name)
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

const orcidApiService = new OrcidApiService();
export default orcidApiService;
