import { ActionType, User } from '@prisma/client';
import { Response } from 'express';
import { OAuth2Client } from 'google-auth-library';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { contributorService } from '../../services/Contributors.js';
import { DataMigrationService } from '../../services/DataMigration/DataMigrationService.js';
import { saveInteractionWithoutReq } from '../../services/interactionLog.js';
import { MergeUserService } from '../../services/user/merge.js';
import { sendCookie } from '../../utils/sendCookie.js';
import { hideEmail } from '../../utils.js';
import { AuthenticatedRequest } from '../notifications/create.js';

import { ConvertGuestResponse } from './convertGuest.js';
import { generateAccessToken } from './magic.js';

const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID_AUTH,
});

type ConvertGuestGoogleBody = {
  idToken: string;
  dev?: string;
};

export const convertGuestToUserGoogle = async (
  req: AuthenticatedRequest<ConvertGuestGoogleBody>,
  res: Response,
): Promise<Response<ConvertGuestResponse>> => {
  const guestUser = req.user;
  const logger = parentLogger.child({ module: '[Auth]::ConvertGuestGoogle', guestUser });

  try {
    const { idToken, dev } = req.body;

    if (!idToken) {
      return res.status(400).send({ ok: false, error: 'Google ID token is required' });
    }

    if (!guestUser || !guestUser.isGuest) {
      logger.info({ userId: guestUser?.id }, 'Non-guest user attempted to use guest conversion');
      return res.status(400).send({ ok: false, error: 'Valid guest account required' });
    }

    logger.info({ userId: guestUser.id }, 'Guest user attempting conversion with Google');

    // Verify the Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID_AUTH,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).send({ ok: false, error: 'Invalid Google credentials' });
    }

    const { email, name, sub: googleId } = payload;
    const cleanEmail = email.toLowerCase();

    logger.info({ userId: guestUser.id, email: hideEmail(cleanEmail) }, 'Guest conversion with Google credentials');

    let isExistingUser = false;
    // Check if email is already registered to another user
    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser && existingUser.id !== guestUser.id) {
      isExistingUser = true;
      logger.info(
        { userId: guestUser.id, email: hideEmail(email), existingUserId: existingUser.id },
        'Email already registered, will use merge guest -> existingUser flow',
      );
      // return res.status(409).send({ ok: false, error: 'Email already registered' });
    }

    let updatedUser: User;
    if (isExistingUser) {
      const mergeRes = await MergeUserService.mergeGuestIntoExistingUser(guestUser.id, existingUser.id);
      if (!mergeRes.success) {
        logger.error({ error: mergeRes.error }, 'Error merging guest into existing user');
        return res.status(500).send({ ok: false, error: 'Failed to merge guest into existing user' });
      }
      updatedUser = existingUser;
    } else {
      updatedUser = await prisma.user.update({
        where: { id: guestUser.id },
        data: {
          email: cleanEmail,
          name: name || null,
          isGuest: false,
          convertedGuest: true,
        },
      });

      // Store Google identity
      await prisma.userIdentity.create({
        data: {
          user: {
            connect: { id: updatedUser.id },
          },
          provider: 'google',
          uid: googleId,
          email: cleanEmail,
          name,
        },
      });
    }

    // Inherits existing user contribution entries that were made with the same email
    const inheritedContributions = await contributorService.updateContributorEntriesForNewUser({
      email: updatedUser.email,
      userId: updatedUser.id,
    });
    logger.trace({
      inheritedContributions: inheritedContributions?.count,
      user: updatedUser,
      email: updatedUser.email,
    });

    logger.info({ userId: updatedUser.id, provider: 'google' }, 'Linked Google identity to converted user');

    // Generate new token for the regular user
    const token = generateAccessToken({ email: updatedUser.email });
    // Return the JWT
    sendCookie(res, token, dev === 'true');

    await saveInteractionWithoutReq({
      action: ActionType.GUEST_USER_CONVERSION,
      data: { userId: updatedUser.id, conversionType: 'google', isExistingUser },
      userId: updatedUser.id,
      submitToMixpanel: true,
    });

    if (!isExistingUser) {
      await saveInteractionWithoutReq({
        action: ActionType.USER_SIGNUP_SUCCESS,
        data: { userId: updatedUser.id, email: updatedUser.email, method: 'google', guestConversion: true },
        userId: updatedUser.id,
        submitToMixpanel: true,
      });
    }

    logger.info(
      { userId: updatedUser.id, email: hideEmail(cleanEmail) },
      isExistingUser
        ? 'Guest user successfully merged into existing user via Google'
        : 'Guest user successfully converted to regular user via Google',
    );

    // Queue data migration
    await DataMigrationService.createGuestToPrivateMigrationJob(updatedUser.id);

    return res.send({
      ok: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        isGuest: false,
        ...(dev === 'true' && { token }),
      },
      isNewUser: !isExistingUser,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to convert guest user with Google');
    return res.status(500).send({ ok: false, error: 'Failed to register account' });
  }
};
