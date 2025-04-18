import { ActionType } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { magicLinkRedeem, verifyMagicCode } from '../../services/auth.js';
import { contributorService } from '../../services/Contributors.js';
import { DataMigrationService } from '../../services/DataMigration/DataMigrationService.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { sendCookie } from '../../utils/sendCookie.js';
import { hideEmail } from '../../utils.js';
import { AuthenticatedRequest } from '../notifications/create.js';

import { generateAccessToken } from './magic.js';

export type ConvertGuestResponse = {
  ok: boolean;
  user?: {
    id: string;
    email: string;
    name: string | null;
    orcid?: string;
    isGuest: boolean;
    /** JWT token - only returned when dev=true in request body */
    token?: string; // Only return when req sent with dev=true in body
  };
  error?: string;
};

type ConvertGuestBody = {
  email: string;
  magicCode: string;
  name?: string;
  dev?: string;
};

export const convertGuestToUser = async (
  req: AuthenticatedRequest<ConvertGuestBody>,
  res: Response,
): Promise<Response<ConvertGuestResponse>> => {
  // debugger;
  const guestUser = req.user;
  const logger = parentLogger.child({ module: '[Auth]::Guest', guestUser });
  try {
    const { email, magicCode, name, dev } = req.body;
    const cleanEmail = email.toLowerCase();

    if (!cleanEmail || !magicCode) {
      return res.status(400).send({ ok: false, error: 'Email and magic code are required' });
    }
    if (!guestUser || !guestUser.isGuest) {
      logger.info({ userId: guestUser?.id }, 'Non-guest user attempted to use guest conversion');
      return res.status(400).send({ ok: false, error: 'Valid guest account required' });
    }

    logger.info({ userId: guestUser.id, email: hideEmail(cleanEmail) }, 'Guest user attempting conversion');

    // Check if email is already registered to another user
    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser && existingUser.id !== guestUser.id) {
      logger.info({ userId: guestUser.id, email: hideEmail(email) }, 'Email already registered');
      return res.status(409).send({ ok: false, error: 'Email already registered' });
    }

    const isCodeValid = await verifyMagicCode(email, magicCode);
    if (!isCodeValid) {
      logger.info({ userId: guestUser.id, email: hideEmail(email) }, 'Invalid magic code provided');
      return res.status(400).send({ ok: false, error: 'Invalid or expired magic code' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: guestUser.id },
      data: {
        email,
        name: name || null,
        isGuest: false,
        convertedGuest: true,
      },
    });

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

    // Generate new token for the regular user
    const token = generateAccessToken({ email: updatedUser.email });
    // Return the JWT
    sendCookie(res, token, dev === 'true');

    saveInteraction(
      req,
      ActionType.GUEST_USER_CONVERSION,
      { userId: updatedUser.id, conversionType: 'email' },
      updatedUser.id,
    );

    logger.info(
      { userId: updatedUser.id, email: hideEmail(email) },
      'Guest user successfully converted to regular user via email/magic code',
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
    });
  } catch (error) {
    logger.error({ error }, 'Failed to convert guest user');
    return res.status(500).send({ ok: false, error: 'Failed to register account' });
  }
};
