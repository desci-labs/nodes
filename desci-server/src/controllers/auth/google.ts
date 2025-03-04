import { ActionType } from '@prisma/client';
import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { checkIfUserAcceptedTerms } from '../../services/user.js';
import { sendCookie } from '../../utils/sendCookie.js';

import { generateAccessToken } from './magic.js';

const logger = parentLogger.child({ module: 'AUTH::GoogleOAuthController' });
const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID_AUTH,
});

/**
 * Handles Google OAuth callback and authentication
 */
export const googleAuth = async (req: Request, res: Response) => {
  try {
    const { credential, dev } = req.body;

    if (!credential) {
      return res.status(400).send({ ok: false, message: 'Missing Google credential' });
    }

    // Verify the Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID_AUTH,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).send({ ok: false, message: 'Invalid Google credential' });
    }
    debugger;
    const { email, name, sub: googleId } = payload;
    logger.info({ email: email, googleId }, 'Google OAuth login attempt');

    // Find or create user
    let user = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          name,
        },
      });
      logger.info({ userId: user.id, email: user.email }, 'Created new user from Google OAuth');
    }

    // Store Google identity if not already stored
    const existingIdentity = await prisma.userIdentity.findFirst({
      where: {
        userId: user.id,
        provider: 'google',
        uid: googleId,
      },
    });

    if (!existingIdentity) {
      await prisma.userIdentity.create({
        data: {
          user: {
            connect: { id: user.id },
          },
          provider: 'google',
          uid: googleId,
          email: email.toLowerCase(),
          name,
        },
      });
      logger.info({ userId: user.id, provider: 'google' }, 'Linked Google identity to user');
    }

    // Generate jwt
    const token = generateAccessToken({ email: user.email });
    sendCookie(res, token, dev === 'true');

    // Check if user has accepted terms
    const termsAccepted = await checkIfUserAcceptedTerms(user.email);

    saveInteraction(req, ActionType.USER_LOGIN, { userId: user.id }, user.id);

    // Send response with jwt
    return res.send({
      ok: true,
      user: {
        email: user.email,
        token,
        termsAccepted,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to authenticate with Google');
    return res.status(401).send({ ok: false, message: 'Authentication failed' });
  }
};
