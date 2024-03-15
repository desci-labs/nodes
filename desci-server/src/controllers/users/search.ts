import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

export const searchProfiles = async (req: Request, res: Response) => {
  const { name } = req.query;
  const logger = parentLogger.child({
    module: 'Users::searchProfiles',
    body: req.body,
    name,
  });

  if (name.toString().length < 2) return res.status(400).json({ error: 'Name query must be at least 2 characters' });

  try {
    const profiles = await prisma.user.findMany({ where: { name: { contains: name as string, mode: 'insensitive' } } });

    if (profiles) {
      const profilesReturn = profiles.map((profile) => ({ name: profile.name, id: profile.id }));
      return res.status(200).json({ profiles: profilesReturn });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to search for profiles');
    return res.status(500).json({ error: 'Search failed' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
