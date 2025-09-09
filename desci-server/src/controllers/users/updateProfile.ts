import { Organization, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { sendEmail } from '../../services/email/email.js';
import { SciweaveEmailTypes } from '../../services/email/sciweaveEmailTypes.js';
import { getUserNameById } from '../../services/user.js';

interface ExpectedBody {
  profile: {
    email?: string;
    name?: string;
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
      googleScholarUrl?: string;
      rorPid?: string[];
      organization?: string;
      email?: string;
    };

    updatedProfile.name = profile.name;

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

    debugger
    if (body.isNewSciweaveUser) {
      
      const { firstName, lastName } = await getUserNameById(user.id); // ID variant for refreshed name, instead of user obj.
      await sendEmail({
        type: SciweaveEmailTypes.SCIWEAVE_WELCOME_EMAIL,
        payload: { email: user.email, firstName, lastName },
      });
    }

    return res.send({ ok: true });
  } catch (error) {
    logger.error({ error }, 'Failed to update profile');
    return res.status(500).send({ ok: false, error });
  }
};

