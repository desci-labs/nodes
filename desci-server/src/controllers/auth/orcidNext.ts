/**
 * Updated orcid login flow following https://miro.com/app/board/uXjVM0RdtUs=/
 */

import { ActionType, User } from '@prisma/client';
import { Request, Response } from 'express';

import { logger as parentLogger } from '../../logger.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { MergeUserService } from '../../services/user/merge.js';
import { connectOrcidToUserIfPossible } from '../../services/user.js';
import { sendCookie } from '../../utils/sendCookie.js';

import { OrcIdRecordData, getOrcidRecord } from './orcid.js';

const logger = parentLogger.child({ module: 'AUTH::OrcidNextController' });
/**
 * check if orcid account is already linked
 */ // for testing mock purposes we can swap out the orcid lookup function
export const orcidCheck =
  (orcidLookup: (orcid: string, accessToken: string) => Promise<OrcIdRecordData> = getOrcidRecord) =>
  async (req: Request, res: Response) => {
    logger.trace({ fn: 'orcid check', body: req.body });
    if (!req.body || !req.body.orcid || !req.body.access_token || !req.body.refresh_token || !req.body.expires_in) {
      logger.error(
        {
          fn: 'orcid check',
          step: 2,
          bodyMissing: !req.body,
          orcidMissing: !req.body.orcid,
          accessTokenMissing: !req.body.access_token,
          refreshTokenMissing: !req.body.refresh_token,
          expiresInMissing: !req.body.expires_in,
        },
        'missing orcid data',
      );
      res.status(400).send({ err: 'missing orcid data', code: 0 });
      return;
    }
    const user = (req as any).user;
    const isUserGuest = user?.isGuest;
    const { access_token, refresh_token, expires_in, orcid, dev } = req.body;
    logger.trace({ access_token, refresh_token, expires_in, orcid, dev }, 'connectOrcidToUserIfPossible');
    const orcidRecord = await connectOrcidToUserIfPossible(
      user?.id,
      orcid,
      access_token,
      refresh_token,
      expires_in,
      orcidLookup,
    );

    logger.trace({ orcidRecord });
    if (orcidRecord.code === 3) {
      // log an orcid email missing error
      await saveInteraction({
        req,
        action: ActionType.USER_ACTION,
        data: { sub: 'orcid-missing-email', orcid },
        userId: user?.id,
      });
    }
    // debugger;
    /*
     ** Handle guest conversion for existing ORCID users
     */
    if (isUserGuest && orcidRecord?.userFound && orcidRecord?.user) {
      const mergeRes = await MergeUserService.handleMergeExistingUserOrcid(orcidRecord.user, user);
      if (!mergeRes.success) {
        logger.error(
          { fn: 'orcidNext', existingUserId: orcidRecord.user.id, guestId: user.id, error: mergeRes.error },
          '[ExistingOrcidGuestConversion] Error merging guest into existing user',
        );
        res.status(500).send({ err: 'guest conversion to existing orcid failed', code: 0 });
        return;
      }
      // Indiciate to the frontend that the guest conversion was successful for side-effects
      orcidRecord['guestConverted'] = true;

      if (orcidRecord.user) {
        const cleanUser = {
          id: orcidRecord.user.id,
          email: orcidRecord.user.email,
          name: orcidRecord.user.name,
          orcid: orcidRecord.user.orcid,
        };
        orcidRecord['user'] = cleanUser as User; // Send user info to the frontend
      }
    }

    const jwtToken = orcidRecord.jwt;
    if (jwtToken) {
      sendCookie(res, jwtToken, dev === 'true');
    }

    logger.trace({ jwtToken });
    res.send(orcidRecord);
  };
