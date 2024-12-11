import { User } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { emailRegex } from '../../core/helper.js';
import { logger as parentLogger } from '../../logger.js';
import { formatOrcidString, orcidRegex } from '../../utils.js';

export type SearchProfilesRequest = Request<never, never, never, { name?: string; orcid?: string }> & {
  user: User; // added by auth middleware
};

export type SearchProfilesResBody =
  | {
      profiles: UserProfile[];
    }
  | {
      error: string;
    };

export type UserProfile = { name: string; id: number; orcid?: string; organisations?: string[] };

export const searchProfiles = async (req: SearchProfilesRequest, res: Response<SearchProfilesResBody>) => {
  // debugger;
  const user = req.user;
  const { name } = req.query;
  let { orcid } = req.query;
  const logger = parentLogger.child({
    module: 'Users::searchProfiles',
    body: req.body,
    userId: user.id,
    name,
    orcid,
    queryType: orcid ? 'orcid' : 'name',
  });

  if (orcid && orcidRegex.test(orcid) === false)
    return res
      .status(400)
      .json({ error: 'Invalid orcid id, orcid must follow either 123456780000 or 1234-4567-8000-0000 format.' });

  if (orcid) orcid = formatOrcidString(orcid); // Ensure hyphenated

  if (name?.toString().length < 2 && !orcid)
    return res.status(400).json({ error: 'Name query must be at least 2 characters' });

  try {
    const isEmail = emailRegex.test(name);
    let emailMatches = [];
    if (isEmail) {
      emailMatches = await prisma.user.findMany({
        where: {
          email: {
            mode: 'insensitive',
            equals: name as string,
          },
        },
        include: { userOrganizations: { include: { organization: { select: { name: true } } } } },
      });
    }

    const profiles = orcid
      ? await prisma.user.findMany({
          where: { orcid: orcid },
          include: { userOrganizations: { include: { organization: { select: { name: true } } } } },
        })
      : await prisma.user.findMany({
          where: { name: { contains: name as string, mode: 'insensitive', not: null } },
          include: { userOrganizations: { include: { organization: { select: { name: true } } } } },
        });

    // logger.info({ profiles }, 'PROFILES');
    if (profiles || emailMatches) {
      const profilesReturn: UserProfile[] = [...emailMatches, ...profiles].map((profile) => ({
        name: profile.name,
        id: profile.id,
        organisations: profile.userOrganizations.map((org) => org.organization.name),
        ...(profile.orcid && { orcid: profile.orcid }),
      }));
      return res.status(200).json({ profiles: profilesReturn });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to search for profiles');
    return res.status(500).json({ error: 'Search failed' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
