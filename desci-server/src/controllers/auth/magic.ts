import { ActionType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { prisma as prismaClient } from '../../client.js';
import { logger } from '../../logger.js';
import { magicLinkRedeem, sendMagicLink } from '../../services/auth.js';
import { contributorService } from '../../services/Contributors.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { checkIfUserAcceptedTerms, connectOrcidToUserIfPossible } from '../../services/user.js';
import { sendCookie } from '../../utils/sendCookie.js';

import { getOrcidRecord } from './orcid.js';

export const generateAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1y' });
};

export const oneYear = 1000 * 60 * 60 * 24 * 365;
export const oneDay = 1000 * 60 * 60 * 24;
export const oneMinute = 1000 * 60;
export const magic = async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    logger.info({ fn: 'magic', email: req.body.email }, `magic link requested`);
  } else {
    logger.info({ fn: 'magic', reqBody: req.body }, `magic link`);
  }

  const { email, code, dev, orcid, access_token, refresh_token, expires_in } = req.body;
  const cleanEmail = email.toLowerCase().trim();

  if (!code) {
    // we are sending the magic code

    let user = await prismaClient.user.findFirst({
      where: {
        email: {
          equals: cleanEmail,
          mode: 'insensitive',
        },
      },
    });

    // force 1 step user creation
    if (!user) {
      user = await prismaClient.user.upsert({
        where: {
          email: cleanEmail,
        },
        create: {
          email: cleanEmail,
        },
        update: {
          email: cleanEmail,
        },
      });

      if (user.email) {
        // Inherits existing user contribution entries that were made with the same email
        const inheritedContributions = await contributorService.updateContributorEntriesForNewUser({
          email: user.email,
          userId: user.id,
        });
        logger.trace({ inheritedContributions: inheritedContributions?.count, user, email });
      }
    }

    try {
      const ip = req.ip;
      const ok = await sendMagicLink(cleanEmail, ip);
      res.send({ ok });
    } catch (err) {
      logger.error({ ...err, fn: 'magic' });
      res.status(400).send({ ok: false, error: err.message });
    }
  } else {
    // we are validating the magic code is correct
    try {
      const user = await magicLinkRedeem(cleanEmail, code);

      if (orcid && user) {
        logger.trace({ fn: 'magic', orcid }, `setting orcid for user`);

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
      const termsAccepted = await checkIfUserAcceptedTerms(email);
      // TODO: Bearer token still returned for backwards compatability, should look to remove in the future.
      res.send({ ok: true, user: { email: user.email, token, termsAccepted } });

      if (!termsAccepted) {
        // saveInteraction(req, ActionType.USER_TERMS_CONSENT, { userId: user.id, email: user.email }, user.id);
      }
      saveInteraction(req, ActionType.USER_LOGIN, { userId: user.id }, user.id);
    } catch (err) {
      res.status(200).send({ ok: false, error: err.message });
    }
  }
};
