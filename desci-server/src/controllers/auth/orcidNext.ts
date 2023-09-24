/**
 * Updated orcid login flow following https://miro.com/app/board/uXjVM0RdtUs=/
 */

import { NextFunction, Request, Response } from 'express';

import parentLogger from 'logger';
import { saveInteraction } from 'services/interactionLog';
import { getUserByOrcId, isAuthTokenSetForUser, setOrcidForUser } from 'services/user';

import { OrcIdRecordData, getOrcidRecord } from './orcid';
const logger = parentLogger.child({ module: 'AUTH::OrcidNextController' });
/**
 * check if orcid account is already linked
 */ // for testing mock purposes we can swap out the orcid lookup function
export const orcidCheck =
  (orcidLookup: (orcid: string, accessToken: string) => Promise<OrcIdRecordData> = getOrcidRecord) =>
  async (req: Request, res: Response) => {
    logger.trace({ fn: 'orcid check' });
    if (!req.body || !req.body.orcid || !req.body.access_token || !req.body.refresh_token || !req.body.expires_in) {
      res.status(400).send({ err: 'missing orcid data', code: 0 });
      return;
    }
    const user = (req as any).user;
    const { access_token, refresh_token, expires_in, orcid } = req.body;
    logger.info({ fn: 'orcidCheck', orcid, accessTokenPresent: !!access_token }, `doing orcid lookup`);
    const orcidRecord = await orcidLookup(orcid, access_token);
    logger.info({ fn: 'orcidCheck', orcidRecord, orcid }, `found orcid record`);

    // if the orcid in the access token doesn't match, we must fail the process because the requestor is not guaranteed to be the owner of the orcid
    if (orcidRecord['orcid-identifier'].path !== orcid) {
      logger.warn({ fn: 'orcidCheck', orcidRecord, orcid }, `orcid record mismatch`);
      res.status(400).send({ err: 'orcid mismatch', code: 1 });
      return;
    }

    if (user) {
      // we are already email auth'd, we have only one to check
      logger.info({ fn: 'orcidCheck', user }, `Requesting user ${user}`);
      if (!user.orcid || user.orcid === orcid) {
        if (!user.orcid || !(await isAuthTokenSetForUser(user.id))) {
          await setOrcidForUser(user.id, orcid, {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresIn: expires_in,
          });
        }
        res.status(200).send({ userFound: true });
      } else {
        res.status(400).send({ err: 'orcid mismatch', code: 2, userFound: true });
      }
    } else {
      // we are not email auth'd, we have to check all users for this orcid
      logger.info({ fn: 'orcidCheck' }, `Orcid first time login, no associated email`);
      const userFound = await getUserByOrcId(orcid);
      if (userFound) {
        if (!userFound.orcid || !(await isAuthTokenSetForUser(userFound.id))) {
          await setOrcidForUser(userFound.id, orcid, {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresIn: expires_in,
          });
        }
        res.status(200).send({ userFound: true });
      } else {
        // we didn't find a user, so we need to prompt for an email verification flow to assign an email to this orcid
        res.status(400).send({ err: 'need to attach email', code: 3, userFound: false });
      }
    }
  };
