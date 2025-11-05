import { Organization, SentEmailType, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { sendEmail } from '../../services/email/email.js';
import { hasEmailBeenSent, recordSentEmail } from '../../services/email/helpers.js';
import { SciweaveEmailTypes } from '../../services/email/sciweaveEmailTypes.js';
import { getUserNameById } from '../../services/user.js';

interface ExpectedBody {
  profile: {
    email?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    discoverySource?: string;
    signupHost?: string;
    profileImage?: string;
    googleScholarUrl?: string;
    rorPid?: string[];
    organization: Organization[];
  };
  isNewSciweaveUser?: boolean;
}

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user as User;
  const body = req.body as ExpectedBody;
  const { profile } = body;
  const logger = parentLogger.child({
    module: 'USERS::updateProfileController',
    body: req.body,
    user: (req as any).user,
    profile,
  });
  try {
    if (!profile) {
      return res.send({ ok: false, error: 'Missing profile from body' });
    }

    /**
     * Note: We don't want to overwrite values with undefined
     * if they weren't included in the payload
     */
    const updatedProfile = {} as {
      name?: string;
      firstName?: string;
      lastName?: string;
      role?: string;
      source?: string;
      signupHost?: string;
      profileImage?: string;
      googleScholarUrl?: string;
      rorPid?: string[];
      organization?: string;
      email?: string;
    };

    // Sync name fields: keep name, firstName, and lastName in sync
    const isUpdatingName = profile.name !== undefined;
    const isUpdatingFirstName = profile.firstName !== undefined;
    const isUpdatingLastName = profile.lastName !== undefined;

    if (isUpdatingName && !isUpdatingFirstName && !isUpdatingLastName) {
      // Name is being updated but not firstName/lastName - split the name
      updatedProfile.name = profile.name;
      const nameParts = profile.name?.split(' ') || [];
      updatedProfile.firstName = nameParts[0] || '';
      updatedProfile.lastName = nameParts.slice(1).join(' ') || '';
    } else if ((isUpdatingFirstName || isUpdatingLastName) && !isUpdatingName) {
      // firstName/lastName are being updated but not name - concatenate them
      // Parse legacy user.name as ultimate fallback
      const nameParts = user.name?.split(' ') || [];
      const fallbackFirst = nameParts[0];
      const fallbackLast = nameParts.slice(1).join(' ');
      
      // Resolve with fallbacks: explicit updates > existing columns > legacy parsed name
      const resolvedFirst = profile.firstName !== undefined 
        ? profile.firstName 
        : (user.firstName ?? fallbackFirst);
      const resolvedLast = profile.lastName !== undefined 
        ? profile.lastName 
        : (user.lastName ?? fallbackLast);
      
      // Rebuild name from resolved values, honoring explicit clears (empty strings)
      updatedProfile.name = [resolvedFirst, resolvedLast]
        .filter(part => part !== undefined && part !== '')
        .join(' ')
        .trim();

      if (profile.firstName !== undefined) {
        updatedProfile.firstName = profile.firstName;
      }
      if (profile.lastName !== undefined) {
        updatedProfile.lastName = profile.lastName;
      }
    } else if (isUpdatingName || isUpdatingFirstName || isUpdatingLastName) {
      // Both sets are being updated - sync name to "firstName lastName"
      if (isUpdatingFirstName) {
        updatedProfile.firstName = profile.firstName;
      }
      if (isUpdatingLastName) {
        updatedProfile.lastName = profile.lastName;
      }

      const finalFirstName = profile.firstName !== undefined ? profile.firstName : user.firstName;
      const finalLastName = profile.lastName !== undefined ? profile.lastName : user.lastName;
      updatedProfile.name = `${finalFirstName || ''} ${finalLastName || ''}`.trim();
    }

    if (profile?.role) {
      updatedProfile.role = profile.role;
    }

    if (profile?.discoverySource) {
      updatedProfile.source = profile.discoverySource;
    }

    if (profile?.signupHost) {
      updatedProfile.signupHost = profile.signupHost;
    }

    if (profile?.profileImage) {
      updatedProfile.profileImage = profile.profileImage;
    }

    if (profile?.organization) {
      const userOrgs = await prisma.userOrganizations.findMany({ where: { userId: user.id } });
      const skipped = userOrgs.filter(
        (userOrg) => profile.organization.findIndex((org) => org.id === userOrg.organizationId) === -1,
      );

      // remove skipped affliations
      await prisma.userOrganizations.deleteMany({
        where: { organizationId: { in: skipped.map((org) => org.organizationId) } },
      });

      await prisma.organization.createMany({ data: profile.organization, skipDuplicates: true });
      const updates = profile.organization.map((org) => ({ userId: user.id, organizationId: org.id })) as unknown as {
        organizationId: string;
        userId: number;
      }[];

      await prisma.userOrganizations.createMany({ data: updates, skipDuplicates: true });
    }

    if (profile?.googleScholarUrl) {
      updatedProfile.googleScholarUrl = profile.googleScholarUrl;
    }

    const emailIsTempOrcIdUrn = user.email.includes('orcid:');
    const shouldUpdateEmail = (profile.email && emailIsTempOrcIdUrn) || (profile.email && !user.email);

    /**
     * Email is in payload
     * But user has a filled out email that is not a temp orcid urn
     */
    const shouldBlockEmailUpdate = profile.email && !shouldUpdateEmail;
    if (shouldBlockEmailUpdate) {
      return res.status(400).send({ ok: false, message: 'Sorry, you cannot update your email' });
    }

    if (shouldUpdateEmail) {
      updatedProfile.email = profile.email;
    }

    try {
      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          ...updatedProfile,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to update user in DB');
      throw error;
    }

    if (body.isNewSciweaveUser) {
      const alreadySent = await hasEmailBeenSent(SentEmailType.SCIWEAVE_WELCOME_EMAIL, user.id);

      if (!alreadySent) {
        const { firstName, lastName } = await getUserNameById(user.id); // ID variant for refreshed name, instead of user obj.
        await sendEmail({
          type: SciweaveEmailTypes.SCIWEAVE_WELCOME_EMAIL,
          payload: { email: user.email, firstName, lastName },
        });

        await recordSentEmail(SentEmailType.SCIWEAVE_WELCOME_EMAIL, user.id);
      } else {
        logger.debug({ userId: user.id }, 'Welcome email already sent, skipping');
      }
    }

    return res.send({ ok: true });
  } catch (error) {
    logger.error({ error }, 'Failed to update profile');
    return res.status(500).send({ ok: false, error });
  }
};
