import { ActionType } from '@prisma/client';
import axios from 'axios';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { verifyMagicCode } from '../../services/auth.js';
import { contributorService } from '../../services/Contributors.js';
import { saveInteraction } from '../../services/interactionLog.js';
import orcidApiService from '../../services/orcid.js';
import orcid from '../../services/orcid.js';
import { sendCookie } from '../../utils/sendCookie.js';
import { hideEmail } from '../../utils.js';
import { AuthenticatedRequest } from '../notifications/create.js';

import { ConvertGuestResponse } from './convertGuest.js';
import { generateAccessToken } from './magic.js';

import { getOrcidRecord, OrcIdRecordData } from './index.js';

type ConvertGuestOrcidBody = {
  orcidIdToken: string;
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
    const { orcidIdToken, email, magicCode, dev } = req.body;
    const cleanEmail = email?.toLowerCase();

    if (!orcidIdToken) {
      return res.status(400).send({ ok: false, error: 'ORCID id_token is required' });
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

    // // Exchange the authorization code for an access token
    // const tokenResponse = await axios.post(
    //   `https://${process.env.ORCID_API_DOMAIN}/oauth/token`,
    //   new URLSearchParams({
    //     client_id: process.env.ORCID_CLIENT_ID,
    //     client_secret: process.env.ORCID_CLIENT_SECRET,
    //     grant_type: 'authorization_code',
    //     code: orcidCode,
    //     redirect_uri: process.env.ORCID_REDIRECT_URI,
    //   }),
    //   {
    //     headers: {
    //       'Content-Type': 'application/x-www-form-urlencoded',
    //       Accept: 'application/json',
    //     },
    //   },
    // );
    // debugger;
    const { orcid: verifiedOrcid, family_name, given_name } = await orcidApiService.verifyOrcidId(orcidIdToken);

    if (!orcidIdToken || !verifiedOrcid) {
      logger.trace({ orcidIdTokenPresent: !!orcidIdToken, verifiedOrcid }, 'Invalid ORCID credentials');
      return res.status(400).send({ ok: false, error: 'Invalid ORCID credentials' });
    }

    // Get name from ORCID data
    const firstName = given_name;
    const familyName = family_name;
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
      where: { orcid: verifiedOrcid },
    });

    if (existingOrcidUser && existingOrcidUser.id !== guestUser.id) {
      logger.info({ userId: guestUser.id, orcid: verifiedOrcid }, 'ORCID ID already registered');
      return res.status(409).send({ ok: false, error: 'ORCID ID already registered' });
    }

    // Update the guest user to a regular user
    const updatedUser = await prisma.user.update({
      where: { id: guestUser.id },
      data: {
        email: cleanEmail,
        name: fullName || undefined,
        orcid: verifiedOrcid,
        isGuest: false,
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

    // Store ORCID identity
    await prisma.userIdentity.create({
      data: {
        user: {
          connect: { id: updatedUser.id },
        },
        provider: 'orcid',
        uid: verifiedOrcid,
        email: cleanEmail,
        name: fullName || null,
      },
    });

    logger.info({ userId: updatedUser.id, provider: 'orcid' }, 'Linked ORCID identity to converted user');

    // Generate new token with both email and orcid
    const token = generateAccessToken({ email: cleanEmail, orcid: verifiedOrcid });

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
        ...(dev === 'true' && { token }),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to convert guest user with ORCID');
    return res.status(500).send({ ok: false, error: 'Failed to register account' });
  }
};
