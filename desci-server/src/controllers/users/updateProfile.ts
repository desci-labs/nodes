import { User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';

// import { PassportReader } from '@gitcoinco/passport-sdk-reader';

interface ExpectedBody {
  username: string;
  profile: {
    email?: string;
    name?: string;
    googleScholarUrl?: string;
    orcid?: string;
  };
}

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user as User;
    const body = req.body as ExpectedBody;
    const { profile } = body;

    if (!profile) {
      return res.send({ ok: false, error: 'Missing profile from body' });
    }

    /**
     * Note: We don't want to overwrite values with undefined
     * if they weren't included in the payload
     */
    const updatedProfile = {} as { name?: string; googleScholarUrl?: string; orcid?: string; email?: string };

    updatedProfile.name = profile.name;

    if (profile?.orcid) {
      updatedProfile.orcid = profile.orcid;
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
      console.log('Failed to update user in DB', error);
      throw error;
    }

    return res.send({ ok: true });
  } catch (error) {
    console.error('Failed to update profile', error);
    return res.status(500).send({ ok: false, error });
  }
};

/**
   * Legacy code for validating gitcoin passport
   * May be useful in future
   * 
  if (profile.gitPasLinked) {
    //broken lib atm
    // const reader = new PassportReader('https://ceramic.passport-iam.gitcoin.co', '1');
    // const valid = await reader.getPassport(profile.gitPasLinked);
    const valid = true; //hardcoded for now

    const wallets = await prisma.wallet.findMany({
      where: { userId: user.id },
    });

    //verify its associated with the user already
    const assoc = wallets.some((wallet) => wallet.address === profile.gitPasLinked);

    if (!valid || !assoc) profile.gitPasLinked = null;
  }
  */
