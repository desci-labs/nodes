import { ActionType } from '@prisma/client';
import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { sendCookie } from '../../utils/sendCookie.js';
import { hideEmail } from '../../utils.js';
import { AuthenticatedRequest } from '../notifications/create.js';

import { generateAccessToken } from './magic.js';

const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID_AUTH,
});

export const convertGuestToUserGoogle = async (req: AuthenticatedRequest, res: Response) => {
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

    // Check if email is already registered to another user
    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser && existingUser.id !== guestUser.id) {
      logger.info({ userId: guestUser.id, email: hideEmail(cleanEmail) }, 'Email already registered');
      return res.status(409).send({ ok: false, error: 'Email already registered' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: guestUser.id },
      data: {
        email: cleanEmail,
        name: name || null,
        isGuest: false,
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

    logger.info({ userId: updatedUser.id, provider: 'google' }, 'Linked Google identity to converted user');

    // Generate new token for the regular user
    const token = generateAccessToken({ email: updatedUser.email });
    // Return the JWT
    sendCookie(res, token, dev === 'true');

    saveInteraction(
      req,
      ActionType.GUEST_USER_CONVERSION,
      { userId: updatedUser.id, conversionType: 'google' },
      updatedUser.id,
    );

    logger.info(
      { userId: updatedUser.id, email: hideEmail(cleanEmail) },
      'Guest user successfully converted to regular user via Google',
    );

    return res.send({
      ok: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        isGuest: false,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to convert guest user with Google');
    return res.status(500).send({ ok: false, error: 'Failed to register account' });
  }
};
