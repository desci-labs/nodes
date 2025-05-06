import { ActionType, User } from '@prisma/client';
import { Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { verifyMagicCode } from '../../services/auth.js';
import { contributorService } from '../../services/Contributors.js';
import { DataMigrationService } from '../../services/DataMigration/DataMigrationService.js';
import { saveInteractionWithoutReq } from '../../services/interactionLog.js';
import orcidApiService from '../../services/orcid.js';
import orcid from '../../services/orcid.js';
import { MergeUserService } from '../../services/user/merge.js';
import { sendCookie } from '../../utils/sendCookie.js';
import { hideEmail } from '../../utils.js';
import { AuthenticatedRequest } from '../notifications/create.js';

import { ConvertGuestResponse } from './convertGuest.js';
import { generateAccessToken } from './magic.js';

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

    let isExistingUser = false;
    if (existingEmailUser && existingEmailUser.orcid !== verifiedOrcid) {
      // For Success in merge flow:
      // The email+orcid combo has to be the same as the existing one.
      logger.info(
        { userId: guestUser.id, email: hideEmail(cleanEmail), existingUserId: existingEmailUser.id },
        'ORCID ID already registered to a different email, rejecting.',
      );
      isExistingUser = true;
      return res.status(409).send({ ok: false, error: 'ORCID ID already registered to a different email.' });
    }

    // Check if the ORCID is already registered to another user
    const existingOrcidUser = await prisma.user.findFirst({
      where: { orcid: verifiedOrcid },
    });

    if (existingOrcidUser) {
      isExistingUser = true;
      if (existingOrcidUser.email !== cleanEmail) {
        // Check if the existing email is the same 'new email' that the user entered,
        // if it doesn't match, we'll reject it as the user would be confused with which
        // email they should sign in with.
        logger.info(
          { userId: guestUser.id, email: hideEmail(cleanEmail), existingUserId: existingEmailUser.id },
          'ORCID ID already registered to a different email, rejecting.',
        );
        return res.status(409).send({ ok: false, error: 'ORCID ID already registered to a different email.' });
      }
      logger.info(
        { userId: guestUser.id, orcid: verifiedOrcid },
        'ORCID ID already registered, will use merge guest -> existingUser flow',
      );
    }

    let updatedUser: User;
    if (isExistingUser) {
      const mergeRes = await MergeUserService.mergeGuestIntoExistingUser(guestUser.id, existingOrcidUser.id);
      if (!mergeRes.success) {
        logger.error({ error: mergeRes.error }, 'Error merging guest into existing user');
        return res.status(500).send({ ok: false, error: 'Failed to merge guest into existing user' });
      }
      updatedUser = existingOrcidUser;
    } else {
      // Update the guest user to a regular user
      updatedUser = await prisma.user.update({
        where: { id: guestUser.id },
        data: {
          email: cleanEmail,
          name: fullName || undefined,
          orcid: verifiedOrcid,
          isGuest: false,
          convertedGuest: true,
        },
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

    // Generate new token with both email and orcid
    const token = generateAccessToken({ email: cleanEmail, orcid: verifiedOrcid });

    // Return the JWT
    sendCookie(res, token, dev === 'true');

    await saveInteractionWithoutReq({
      action: ActionType.GUEST_USER_CONVERSION,
      data: { userId: updatedUser.id, conversionType: 'orcid', isExistingUser },
      userId: updatedUser.id,
      submitToMixpanel: true,
    });

    if (!isExistingUser) {
      await saveInteractionWithoutReq({
        action: ActionType.USER_SIGNUP_SUCCESS,
        data: { userId: updatedUser.id, email: updatedUser.email, orcid, method: 'orcid', guestConversion: true },
        userId: updatedUser.id,
        submitToMixpanel: true,
      });
    }

    logger.info(
      { userId: updatedUser.id, email: hideEmail(cleanEmail), orcid },
      isExistingUser
        ? 'Guest user successfully merged with existing user via ORCID'
        : 'Guest user successfully converted to regular user via ORCID',
    );

    // Queue data migration
    await DataMigrationService.createGuestToPrivateMigrationJob(updatedUser.id);

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
      isNewUser: !isExistingUser,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to convert guest user with ORCID');
    return res.status(500).send({ ok: false, error: 'Failed to register account' });
  }
};
