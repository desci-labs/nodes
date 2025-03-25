import { ActionType } from '@prisma/client';
import axios from 'axios';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { verifyMagicCode } from '../../services/auth.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { sendCookie } from '../../utils/sendCookie.js';
import { hideEmail } from '../../utils.js';
import { AuthenticatedRequest } from '../notifications/create.js';

import { ConvertGuestResponse } from './convertGuest.js';
import { generateAccessToken } from './magic.js';

import { getOrcidRecord, OrcIdRecordData } from './index.js';

type ConvertGuestOrcidBody = {
  orcidCode: string;
  email: string;
  magicCode: string;
  dev?: string;
};

export const convertGuestToUserOrcid = async (
  req: AuthenticatedRequest<ConvertGuestOrcidBody>,
  res: Response,
): Promise<Response<ConvertGuestResponse>> => {
  const guestUser = req.user;
  const logger = parentLogger.child({ module: '[Auth]::ConvertGuestOrcid', guestUser });

  try {
    const { orcidCode, email, magicCode, dev } = req.body;
    const cleanEmail = email?.toLowerCase();

    if (!orcidCode) {
      return res.status(400).send({ ok: false, error: 'ORCID authorization code is required' });
    }

    if (!cleanEmail || !magicCode) {
      return res.status(400).send({ ok: false, error: 'Email and magic code are required' });
    }

    if (!guestUser || !guestUser.isGuest) {
      logger.info({ userId: guestUser?.id }, 'Non-guest user attempted to use guest conversion');
      return res.status(400).send({ ok: false, error: 'Valid guest account required' });
    }

    logger.info({ userId: guestUser.id, email: hideEmail(cleanEmail) }, 'Guest user attempting conversion with ORCID');

    // Verify the magic code for email
    const isCodeValid = await verifyMagicCode(cleanEmail, magicCode);
    if (!isCodeValid) {
      logger.info({ userId: guestUser.id, email: hideEmail(cleanEmail) }, 'Invalid magic code provided');
      return res.status(400).send({ ok: false, error: 'Invalid or expired magic code' });
    }

    // Exchange the authorization code for an access token
    const tokenResponse = await axios.post(
      `https://${process.env.ORCID_API_DOMAIN}/oauth/token`,
      new URLSearchParams({
        client_id: process.env.ORCID_CLIENT_ID,
        client_secret: process.env.ORCID_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: orcidCode,
        redirect_uri: process.env.ORCID_REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      },
    );

    const { access_token, orcid } = tokenResponse.data;

    if (!access_token || !orcid) {
      return res.status(400).send({ ok: false, error: 'Invalid ORCID credentials' });
    }

    // Fetch user information from ORCID
    const userData: OrcIdRecordData = await getOrcidRecord(orcid, access_token);

    // Get name from ORCID data
    const firstName = userData.person.name?.['given-names']?.value || null;
    const familyName = userData.person.name?.['family-name']?.value || null;
    const fullName = firstName && familyName ? `${firstName} ${familyName}` : firstName || familyName || null;

    // Check if email is already registered to another user
    const existingEmailUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existingEmailUser && existingEmailUser.id !== guestUser.id) {
      logger.info({ userId: guestUser.id, email: hideEmail(cleanEmail) }, 'Email already registered');
      return res.status(409).send({ ok: false, error: 'Email already registered' });
    }

    // Check if ORCID is already registered to another user
    const existingOrcidUser = await prisma.user.findFirst({
      where: { orcid },
    });

    if (existingOrcidUser && existingOrcidUser.id !== guestUser.id) {
      logger.info({ userId: guestUser.id, orcid }, 'ORCID ID already registered');
      return res.status(409).send({ ok: false, error: 'ORCID ID already registered' });
    }

    // Update the guest user to a regular user
    const updatedUser = await prisma.user.update({
      where: { id: guestUser.id },
      data: {
        email: cleanEmail,
        name: fullName || undefined,
        orcid: orcid,
        isGuest: false,
      },
    });

    // Store ORCID identity
    await prisma.userIdentity.create({
      data: {
        user: {
          connect: { id: updatedUser.id },
        },
        provider: 'orcid',
        uid: orcid,
        email: cleanEmail,
        name: fullName || null,
      },
    });

    logger.info({ userId: updatedUser.id, provider: 'orcid' }, 'Linked ORCID identity to converted user');

    // Generate new token with both email and orcid
    const token = generateAccessToken({ email: cleanEmail, orcid });

    // Return the JWT
    sendCookie(res, token, dev === 'true');

    saveInteraction(
      req,
      ActionType.GUEST_USER_CONVERSION,
      { userId: updatedUser.id, conversionType: 'orcid' },
      updatedUser.id,
    );

    logger.info(
      { userId: updatedUser.id, email: hideEmail(cleanEmail), orcid },
      'Guest user successfully converted to regular user via ORCID',
    );

    return res.send({
      ok: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        orcid: updatedUser.orcid,
        isGuest: false,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to convert guest user with ORCID');
    return res.status(500).send({ ok: false, error: 'Failed to register account' });
  }
};
