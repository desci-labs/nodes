import { ActionType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { prisma as prismaClient } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { magicLinkRedeem, sendMagicLink } from '../../services/auth.js';
import { saveInteraction, saveInteractionWithoutReq } from '../../services/interactionLog.js';
import {
  checkIfUserAcceptedTerms,
  connectOrcidToUserIfPossible,
  getAccountDeletionRequest,
} from '../../services/user.js';
import { sendCookie } from '../../utils/sendCookie.js';

import { getOrcidRecord } from './orcid.js';

export const generateAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1y' });
};

export const oneYear = 1000 * 60 * 60 * 24 * 365;
export const oneDay = 1000 * 60 * 60 * 24;
export const oneMinute = 1000 * 60;
export const magic = async (req: Request, res: Response, next: NextFunction) => {
  const { email, code, dev, orcid, access_token, refresh_token, expires_in, isSciweave } = req.body;
  const cleanEmail = email?.toLowerCase().trim();

  const logger = parentLogger.child({
    module: '[Auth]::Magic',
    email: email,
    cleanEmail: cleanEmail,
    code: `${code ? 'XXXX' + code.slice(-2) : ''}`,
    orcid,
    isSciweave,
  });

  if (process.env.NODE_ENV === 'production') {
    if (code) {
      logger.info({ email: req.body.email }, `[MAGIC] User attempting to auth with magic code: XXXX${code.slice(-2)}`);
    } else {
      logger.info({ email: req.body.email }, `[MAGIC] User requested a magic code, cleanEmail: ${cleanEmail}`);
    }
  } else {
    logger.info({ fn: 'magic', reqBody: req.body }, `magic link`);
  }

  const rejectDeactivatedAccounts = async ({
    userId,
    scheduledDeletionAt,
  }: {
    userId: number;
    scheduledDeletionAt: string;
  }) => {
    await saveInteractionWithoutReq({
      action: ActionType.ACCOUNT_DELETION_LOGIN_BLOCKED,
      userId,
      data: {
        scheduledDeletionAt,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });
    logger.info({ userId }, 'Magic code blocked: account scheduled for deletion');
    res.status(200).send({
      ok: true,
      accountDisabled: true,
      scheduledDeletionAt,
    });
  };

  if (!code) {
    // we are sending the magic code
    try {
      const userByEmail = await prismaClient.user.findUnique({
        where: { email: cleanEmail },
        select: { id: true },
      });
      if (userByEmail) {
        const pendingDeletion = await getAccountDeletionRequest(userByEmail.id);
        if (pendingDeletion) {
          return rejectDeactivatedAccounts({
            userId: userByEmail.id,
            scheduledDeletionAt: pendingDeletion.scheduledDeletionAt.toISOString(),
          });
        }
      }
      const ip = req.ip;
      const ok = await sendMagicLink(cleanEmail, ip, undefined, isSciweave);
      logger.info({ ok }, 'Magic link sent');
      res.send({ ok: !!ok });
    } catch (err) {
      logger.error({ err }, 'Failed sending code');
      res.status(400).send({ ok: false, error: 'Failed sending code' });
    }
  } else {
    // we are validating the magic code is correct
    try {
      const { user, isNewUser } = await magicLinkRedeem(cleanEmail, code);

      if (!user) throw new Error('User not found');

      const pendingDeletion = await getAccountDeletionRequest(user.id);
      if (pendingDeletion) {
        return rejectDeactivatedAccounts({
          userId: user.id,
          scheduledDeletionAt: pendingDeletion.scheduledDeletionAt.toISOString(),
        });
      }

      if (orcid && user) {
        logger.trace(
          {
            orcid,
            accessTokenLength: access_token?.length,
            accessTokenPresent: !!access_token,
            refreshTokenLength: refresh_token?.length,
            refreshTokenPresent: !!refresh_token,
            orcidAccessExpiry: expires_in,
          },

          `setting orcid for user`,
        );

        if (!user.name) {
          const orcidRecord = await getOrcidRecord(orcid, access_token);
          const nameObj = orcidRecord['person']['name'];
          const name = `${[nameObj['given-names']?.value, nameObj['family-name']?.value].filter(Boolean).join(' ')}`;
          await prismaClient.user.update({
            where: {
              id: user.id,
            },
            data: {
              name,
            },
          });
        }

        await connectOrcidToUserIfPossible(user.id, orcid, access_token, refresh_token, expires_in, getOrcidRecord);
      }

      const token = generateAccessToken({ email: user.email });

      sendCookie(res, token, dev === 'true');
      // we want to check if the user exists to show a "create account" prompt with checkbox to accept terms if this is the first login
      const termsAccepted = await checkIfUserAcceptedTerms(user.email);
      // TODO: Bearer token still returned for backwards compatability, should look to remove in the future.
      res.send({
        ok: true,
        user: { email: user.email, token, termsAccepted, isGuest: user.isGuest, id: user.id },
        ...(isNewUser ? { isNewUser } : {}), // Indicate to the client that the user is new - for conversion analytics.
      });

      logger.info('[MAGIC] User logged in successfully');

      if (!termsAccepted) {
        // saveInteraction(req, ActionType.USER_TERMS_CONSENT, { userId: user.id, email: user.email }, user.id);
      }
      await saveInteraction({
        req,
        action: ActionType.USER_LOGIN,
        data: { userId: user.id, method: 'magic', isSciweave },
        userId: user.id,
        submitToMixpanel: true,
      });

      if (isNewUser) {
        await saveInteraction({
          req,
          action: ActionType.USER_SIGNUP_SUCCESS,
          data: { userId: user.id, email: user.email, orcid, method: !orcid ? 'magic' : 'orcid', isSciweave },
          userId: user.id,
          submitToMixpanel: true,
        });
      }
    } catch (err) {
      logger.error({ err }, 'Failed redeeming code');
      res.status(400).send({ ok: false, error: 'Failed redeeming code' });
    }
  }
};
