import { User } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

export type SearchProfilesRequest = Request<never, never, never, { name: string }> & {
  user: User; // added by auth middleware
};

export type SearchProfilesResBody =
  | {
      profiles: UserProfile[];
    }
  | {
      error: string;
    };

export type UserProfile = { name: string; id: number; orcid?: string };

export const searchProfiles = async (req: SearchProfilesRequest, res: Response<SearchProfilesResBody>) => {
  const user = req.user;
  const { name } = req.query;
  const logger = parentLogger.child({
    module: 'Users::searchProfiles',
    body: req.body,
    userId: user.id,
    name,
  });

  if (name.toString().length < 2) return res.status(400).json({ error: 'Name query must be at least 2 characters' });

  try {
    const profiles = await prisma.user.findMany({ where: { name: { contains: name as string, mode: 'insensitive' } } });

    if (profiles) {
      const profilesReturn: UserProfile[] = profiles.map((profile) => ({
        name: profile.name,
        id: profile.id,
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
