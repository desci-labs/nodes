import { ActionType } from '@prisma/client';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

import { prisma } from '../../client.js';
import { ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { appleLoginSchema } from '../../schemas/auth.schema.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { checkIfUserAcceptedTerms } from '../../services/user.js';
import { sendCookie } from '../../utils/sendCookie.js';
import { splitName } from '../../utils.js';

import { generateAccessToken } from './magic.js';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';

/** Cached Apple JWKS client for verifying identity token signatures */
const appleJwksClient = jwksRsa({
  jwksUri: APPLE_JWKS_URI,
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
});

export interface AppleVerifiedClaims {
  sub: string;
  email: string | null;
}

/**
 * Fetches Apple's JWKS, verifies the identity token signature, and validates claims.
 * Returns authoritative sub (uid) and email from the verified token payload, or null if invalid.
 */
export async function verifyAppleIdentityToken(identityToken: string): Promise<AppleVerifiedClaims | null> {
  const appleClientId = process.env.APPLE_CLIENT_ID;
  if (!appleClientId) {
    parentLogger.child({ module: 'AUTH::AppleOAuthController' }).error('APPLE_CLIENT_ID is not set');
    return null;
  }
  try {
    const decoded = await new Promise<jwt.JwtPayload>((resolve, reject) => {
      const getKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
        if (!header.kid) {
          callback(new Error('JWT header missing kid'));
          return;
        }
        appleJwksClient.getSigningKey(header.kid, (err, key) => {
          if (err) {
            callback(err);
            return;
          }
          const signingKey = key ? key.getPublicKey() : null;
          callback(null, signingKey ?? undefined);
        });
      };
      jwt.verify(
        identityToken,
        getKey,
        {
          algorithms: ['RS256'],
          audience: appleClientId,
          issuer: APPLE_ISSUER,
        },
        (err, payload) => {
          if (err) reject(err);
          else resolve((payload ?? {}) as jwt.JwtPayload);
        },
      );
    });

    const emailVerified = decoded.email_verified;
    const tokenEmail = typeof decoded.email === 'string' ? decoded.email : null;
    if (tokenEmail != null && emailVerified !== true && emailVerified !== 'true') {
      parentLogger
        .child({ module: 'AUTH::AppleOAuthController' })
        .warn({ sub: decoded.sub }, 'Apple identity token email_verified claim not true when email present');
      return null;
    }

    return {
      sub: decoded.sub as string,
      email: tokenEmail,
    };
  } catch (error) {
    parentLogger
      .child({ module: 'AUTH::AppleOAuthController' })
      .error(
        { error, identityTokenPrefix: identityToken?.substring(0, 30) },
        'Apple identity token verification failed',
      );
    return null;
  }
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
    const verified = await verifyAppleIdentityToken(identityToken);
    if (!verified) {
      logger.warn('Apple identity token verification failed or claims invalid');
      return res.status(401).send({ ok: false, message: 'Authentication failed' });
    }

    if (appleUserId !== verified.sub) {
      logger.warn(
        { appleUserId, verifiedSub: verified.sub },
        'Client-sent user (appleUserId) does not match verified token sub',
      );
      return res.status(401).send({ ok: false, message: 'Authentication failed' });
    }
    if (emailParam != null && emailParam !== '' && (verified.email == null || emailParam !== verified.email)) {
      logger.warn(
        { emailParam: emailParam?.substring(0, 20), verifiedEmail: verified.email?.substring(0, 20) },
        'Client-sent email does not match verified token email',
      );
      return res.status(401).send({ ok: false, message: 'Authentication failed' });
    }

    const email = verified.email ? verified.email.toLowerCase() : null;
    const name = `${fullName?.givenName ?? ''} ${fullName?.familyName ?? ''}`.trim();

    let user: Awaited<ReturnType<typeof prisma.user.findFirst>>;
    if (email) {
      user = await prisma.user.findFirst({
        where: { email },
      });
    } else {
      const identity = await prisma.userIdentity.findFirst({
        where: { provider: 'apple', uid: verified.sub },
        include: { user: true },
      });
      user = identity?.user ?? null;
    }

    let isNewUser = false;
    if (!user) {
      if (!email) {
        logger.warn('No verified email in token and no existing user for this Apple sub');
        return res.status(401).send({ ok: false, message: 'Authentication failed' });
      }
      isNewUser = true;
      const { firstName, lastName } = splitName(name);
      user = await prisma.user.create({
        data: {
          email,
          name,
          firstName,
          lastName,
        },
      });
      logger.info({ userId: user.id, email: user.email }, 'Created new user from Apple OAuth');

      try {
        const { initializeTrialForNewUser } = await import('../../services/subscription.js');
        await initializeTrialForNewUser(user.id);
      } catch (error) {
        logger.error({ error, userId: user.id }, 'Failed to initialize trial for new user');
      }
    } else {
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

    const authoritativeUid = verified.sub;
    const authoritativeEmail = (verified.email ?? user.email).toLowerCase();

    const existingIdentity = await prisma.userIdentity.findFirst({
      where: {
        userId: user.id,
        provider: 'apple',
        uid: authoritativeUid,
      },
    });

    if (!existingIdentity) {
      await prisma.userIdentity.create({
        data: {
          user: {
            connect: { id: user.id },
          },
          provider: 'apple',
          uid: authoritativeUid,
          email: authoritativeEmail,
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
