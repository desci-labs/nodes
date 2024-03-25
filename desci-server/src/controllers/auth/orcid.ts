import { ActionType } from '@prisma/client';
import axios, { AxiosRequestConfig } from 'axios';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import qs from 'qs';

import { logger as parentLogger } from '../../logger.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { createUser, getUserByOrcId } from '../../services/user.js';

const logger = parentLogger.child({ module: 'AUTH::OrcidController' });

export const orcidConnect = async (req: Request, res: Response) => {
  processOrcidConnect(req, res, false);
};

export const orcidConnectClose = async (req: Request, res: Response) => {
  processOrcidConnect(req, res, true);
};

export const orcidAuth = async (req: Request, res: Response) => {
  processOrcidAuth(req, res, false);
};

export const orcidAuthClose = async (req: Request, res: Response) => {
  processOrcidAuth(req, res, true);
};

export const validateOrcid = async (req: Request, res: Response) => {
  // console.log('TOK', req.query.token);
  try {
    const url = `https://api.${process.env.ORCID_API_DOMAIN}/v3.0/${req.query.orcid}/record`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${req.query.token}`, 'Content-Type': 'application/json', Accept: '*/*' },
    });
    res.send({ data, ok: true });
  } catch (err) {
    logger.error({ err, fn: 'validateOrcid', req });
    res.status(400).send({ ok: false, err });
  }
};

export interface OrcIdRecordData {
  'orcid-identifier': {
    path: string;
  };
  person: {
    name?: {
      'given-names': { value: string } | null;
      'family-name': { value: string } | null;
    };
    emails: {
      email: {
        email: string;
      }[];
    };
  };
}
export const getOrcidRecord = async (orcid: string, accessToken: string): Promise<OrcIdRecordData> => {
  /**
   * this will fail if the orcid doesn't match the accessToken
   */
  const config: AxiosRequestConfig = {
    method: 'get',
    url: `https://api.${process.env.ORCID_API_DOMAIN}/v3.0/${orcid}/record`,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  };
  logger.info(
    { fn: 'getOrcidRecord', orcid, orcidDomain: process.env.ORCID_API_DOMAIN },
    `Fetching OrcId Record for ${orcid}`,
  );
  const { data } = await axios(config);
  logger.info({ fn: 'getOrcidRecord', orcid, data }, `Received OrcId Record data`);

  return data as OrcIdRecordData;
};

const getAllOrcData = async ({ queryCode, redirectUri }: { queryCode: string; redirectUri: string }) => {
  // complete 3-legged oauth https://info.orcid.org/documentation/api-tutorials/api-tutorial-get-and-authenticated-orcid-id/#easy-faq-2537
  const data = qs.stringify({
    client_id: process.env.ORCID_CLIENT_ID,
    client_secret: process.env.ORCID_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: queryCode,
    redirect_uri: redirectUri,
  });

  logger.trace({ fn: 'getAllOrcData', data, redirectUri, queryCode }, 'Sending ORCID request');
  const orcAuthResponse = await axios.post<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>(`https://${process.env.ORCID_API_DOMAIN}/oauth/token`, data, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  logger.trace({ fn: 'getAllOrcData', orcidRes: orcAuthResponse.data }, `ORCID RESPONSE`);

  // retrieve additional fields from orcid with auth token
  const orcRecord = await getOrcidRecord(orcAuthResponse.data['orcid'], orcAuthResponse.data['access_token']);
  logger.info({ fn: 'getAllOrcData', orcRecord }, 'Received OrcId Data');

  const orcAuthData = {
    orcid: orcAuthResponse.data['orcid'],
    orcidAccessToken: orcAuthResponse.data['access_token'],
    orcidRefreshToken: orcAuthResponse.data['refresh_token'],
    orcidExpiresIn: orcAuthResponse.data['expires_in'],
  };

  return { orcAuthData, orcRecord };
};

const processOrcidConnect = async (req: Request, res: Response, closing: boolean) => {
  logger.trace({ fn: 'processOrcidConnect', reqQuery: req.query, closing }, `CODE ${req.query} ${closing}`);
  const user = (req as any).user;
  logger.info({ fn: 'processOrcidConnect', user }, `Requesting user ${user}`);

  const redirectUri = `${process.env.SERVER_URL}/v1/auth/orcid/connect` + (closing ? '/close' : '');

  try {
    // retrieve additional fields from orcid with auth token
    const { orcAuthData, orcRecord } = await getAllOrcData({ queryCode: req.query.code as string, redirectUri });
    await saveInteraction(req, ActionType.ORCID_RETRIEVE, { orcAuthData, orcRecord });

    const cookieObj = {
      orcid_access_token: orcAuthData.orcidAccessToken,
      orcid_refresh_token: orcAuthData.orcidRefreshToken,
      orcid_expires_in: orcAuthData.orcidExpiresIn,
      orcid: orcAuthData.orcid,
    };

    if (closing) {
      const orcData = Buffer.from(JSON.stringify(cookieObj)).toString('base64');
      res.redirect(`${process.env.DAPP_URL}/app/orcid/connect?close=true&orcData=${orcData}`);
    }

    res.status(500).send();
    return;
  } catch (err) {
    logger.error({ fn: 'processOrcidConnect', err }, 'error processing orcid connect');
    res.status(400).send({ err });
  }
};

const processOrcidAuth = async (req: Request, res: Response, closing: boolean) => {
  const redirectUri = `${process.env.SERVER_URL}/v1/auth/orcid/auth` + (closing ? '/close' : '');

  try {
    const { orcAuthData, orcRecord } = await getAllOrcData({ queryCode: req.query.code as string, redirectUri });

    await saveInteraction(req, ActionType.ORCID_RETRIEVE, { orcAuthData, orcRecord });

    const orcid = orcRecord['orcid-identifier'].path;

    let user = await getUserByOrcId(orcAuthData.orcid);

    if (!user) {
      const namesInOrcProfile = orcRecord.person.name
        ? {
            firstName: orcRecord.person.name['given-names']?.value,
            lastName: orcRecord.person.name['family-name']?.value,
          }
        : null;

      const name = namesInOrcProfile?.firstName
        ? `${namesInOrcProfile.firstName} ${namesInOrcProfile.lastName}`
        : undefined;
      /**
       * Users can have multiple emails in orc, but we only want to use the primary one
       * This is also dependent on the email being "public" in their OrcId profile
       * Otherwise we can use an orcid urn as a placeholder
       * Having a unique email is necessary so we need something there
       */
      const primaryEmailInOrcProfile = orcRecord.person.emails.email[0]?.email;
      const email = primaryEmailInOrcProfile ? primaryEmailInOrcProfile : `orcid:${orcid}`;

      user = await createUser({ name, email, orcid });
    }

    logger.info({ fn: 'processOrcidAuth', user }, `User logging in with OrcId ${user}`);

    const jwtToken = jwt.sign({ email: user.email, orcid }, process.env.JWT_SECRET, { expiresIn: '1y' });
    const cookieObj = {
      orcid_access_token: orcAuthData.orcidAccessToken,
      orcid_refresh_token: orcAuthData.orcidRefreshToken,
      orcid_expires_in: orcAuthData.orcidExpiresIn,
      orcid,
      jwtToken,
    };

    if (closing) {
      const orcData = Buffer.from(JSON.stringify(cookieObj)).toString('base64');
      res.redirect(`${process.env.DAPP_URL}/app/orcid/auth?close=true&orcData=${orcData}`);
    }

    res.status(500).send();
    return;
  } catch (err) {
    logger.error({ fn: 'processOrcidAuth', err }, 'error processing orcid auth');
    res.status(400).send({ err });
  }
};
