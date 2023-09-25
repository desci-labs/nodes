/**
 * Updated orcid login flow following https://miro.com/app/board/uXjVM0RdtUs=/
 */

import { NextFunction, Request, Response } from 'express';

import parentLogger from 'logger';
import { connectOrcidToUserIfPossible } from 'services/user';

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
    debugger;
    const orcidRecord = await connectOrcidToUserIfPossible(
      user?.id,
      orcid,
      access_token,
      refresh_token,
      expires_in,
      orcidLookup,
    );

    res.send(orcidRecord);
  };
