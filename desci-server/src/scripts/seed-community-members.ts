import { CommunityMembershipRole } from '@prisma/client';

import { prisma } from '../client.js';
import { logger } from '../logger.js';

export const addCommunityMembers = async (communityId?: string, memberId?: string) => {
  if (!communityId || !memberId)
    throw new Error(`Invalid args: RUN yarn script:seed-community-member [communityId] [userId]`);

  const community = await prisma.desciCommunity.findFirst({ where: { id: parseInt(communityId) } });
  if (!community) throw new Error(`No Desci community with ID: ${communityId} found!`);

  const userId = parseInt(memberId);
  const user = await prisma.user.findFirst({ where: { id: userId } });
  if (!user) throw new Error(`No User with ID: ${userId} found!`);

  if (!user.orcid) {
    // throw new Error(`User ${user.name} with ID: ${userId} has no orcid profile!`);
  }
  const inserted = await prisma.communityMember.upsert({
    create: { userId, communityId: parseInt(communityId), role: CommunityMembershipRole.MEMBER },
    update: {},
    where: { userId_communityId: { userId, communityId: parseInt(communityId) } },
  });

  logger.info({ inserted }, `${user.name} is now a memeber of ${community.name}`);
};

// use first argument as dpid
addCommunityMembers(process.argv[2], process.argv[3])
  .then(() => logger.info({}, 'Script Ran successfully'))
  .catch((err) => console.log('Error running script ', err));
