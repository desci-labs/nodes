import { ActionType } from '@prisma/client';
import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

import { prisma } from '../../client.js';
import { ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { appleLoginSchema } from '../../schemas/auth.schema.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { checkIfUserAcceptedTerms } from '../../services/user.js';
import { sendCookie } from '../../utils/sendCookie.js';
import { splitName } from '../../utils.js';

import { generateAccessToken } from './magic.js';

interface AppleIdentityTokenData {
  header: { kid: string; alg: string };
  payload: {
    iss: string;
    aud: string;
    exp: number;
    iat: number;
    sub: string;
    c_hash: string;
    email: string;
    email_verified: boolean;
    auth_time: number;
    nonce_supported: boolean;
  };
  signature: string;
}

type AppleLoginRequest = ValidatedRequest<typeof appleLoginSchema, Request>;
/**
 * Handles Apple OAuth callback and authentication
 */
export const appleLogin = async (req: AppleLoginRequest, res: Response) => {
  const {
    authorizationCode,
    email: emailParam,
    fullName,
    identityToken,
    realUserStatus,
    state,
    user: appleUserId,
  } = req.validatedData.body;
  const { dev } = req.query;
  const logger = parentLogger.child({
    module: 'AUTH::AppleOAuthController',
    authorizationCode: !!authorizationCode,
    email: !!emailParam,
    fullName: !!fullName,
    identityToken: !!identityToken,
    realUserStatus: !!realUserStatus,
    state: !!state,
    user: !!appleUserId,
  });
  try {
    logger.info(
      {
        authorizationCode: authorizationCode?.substring(0, 20) + '...',
        email: emailParam?.substring(0, 20) + '...',
        fullName: `${fullName?.givenName ?? ''} ${fullName?.familyName ?? ''}`.trim().substring(0, 20) + '...',
        identityToken: identityToken?.substring(0, 20) + '...',
        realUserStatus: realUserStatus,
        state: state?.substring(0, 20) + '...',
        user: appleUserId?.substring(0, 20) + '...',
      },
      'Apple OAuth login attempt',
    );

    let email = emailParam;
    if (!email) {
      // returning user, decode identity token (jwt)
      const decoded = jwt.decode(identityToken, {
        complete: true,
      }) as AppleIdentityTokenData;
      email = decoded.payload.email;
    }

    // Find or create user
    let user = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
    });
    let isNewUser = false;
    const name = `${fullName?.givenName ?? ''} ${fullName?.familyName ?? ''}`.trim();

    if (!user) {
      isNewUser = true;
      const { firstName, lastName } = splitName(name);
      // Create new user
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          name,
          firstName,
          lastName,
        },
      });
      logger.info({ userId: user.id, email: user.email }, 'Created new user from Apple OAuth');

      // Initialize trial for new user
      try {
        const { initializeTrialForNewUser } = await import('../../services/subscription.js');
        await initializeTrialForNewUser(user.id);
      } catch (error) {
        logger.error({ error, userId: user.id }, 'Failed to initialize trial for new user');
      }
    } else {
      logger.info({ userId: user.id, email: user.email }, 'Found existing user from Google OAuth');

      // Check if the user has a name set, if not use the one from Google.
      if (!user.name) {
        const { firstName, lastName } = splitName(name);
        user = await prisma.user.update({
          where: { id: user.id },
          data: { name, firstName, lastName },
        });
      }
    }

    if (isNewUser)
      await saveInteraction({
        req,
        action: ActionType.USER_SIGNUP_SUCCESS,
        data: { userId: user.id, email: user.email, method: 'apple', isSciweave: true },
        userId: user.id,
        submitToMixpanel: true,
      });

    // Store Google identity if not already stored
    const existingIdentity = await prisma.userIdentity.findFirst({
      where: {
        userId: user.id,
        provider: 'apple',
        uid: appleUserId,
      },
    });

    if (!existingIdentity) {
      await prisma.userIdentity.create({
        data: {
          user: {
            connect: { id: user.id },
          },
          provider: 'apple',
          uid: appleUserId,
          email: email.toLowerCase(),
          name,
        },
      });
      logger.info({ userId: user.id, provider: 'apple' }, 'Linked Apple identity to user');
    } else {
      logger.info({ userId: user.id, provider: 'apple' }, 'Found existing Apple identity');
    }

    // Generate jwt
    const token = generateAccessToken({ email: user.email });
    sendCookie(res, token, dev === 'true');

    // Check if user has accepted terms
    const termsAccepted = await checkIfUserAcceptedTerms(user.email);

    await saveInteraction({
      req,
      action: ActionType.USER_LOGIN,
      data: { userId: user.id, method: 'apple' },
      userId: user.id,
      submitToMixpanel: true,
    });

    logger.info({ userId: user.id, email: user.email }, 'Successful login with apple auth');
    // Send response with jwt
    return res.send({
      ok: true,
      user: {
        email: user.email,
        token,
        termsAccepted,
        id: user.id,
        ...(isNewUser ? { isNewUser } : {}), // Remove this in the future - duplicated to be consistent with magic.ts, make sure all frontend functionality migrated.
      },
      ...(isNewUser ? { isNewUser } : {}),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to authenticate with Apple');
    return res.status(401).send({ ok: false, message: 'Authentication failed' });
  }
};
