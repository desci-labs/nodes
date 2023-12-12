import { User } from '@prisma/client';

import { prisma as client } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import createRandomCode from '../utils/createRandomCode.js';

const logger = parentLogger.child({ module: 'Services::Invites' });

const inviteUser = async (from: User, invitedEmail: string) => {
  if (!from.isAdmin) {
    throw Error('Must be admin');
  }

  const email = invitedEmail.toLowerCase();

  const invite = await client.invite.findMany({
    where: {
      senderId: from.id,
      email,
      expired: false,
    },
  });

  if (invite.length) {
    const ids = invite.map((i) => i.id);
    logger.trace({ fn: 'inviteUser', invitedEmail, ids, from }, 'invite::inviteUser');
    await client.invite.updateMany({
      where: {
        id: {
          in: ids,
        },
        senderId: from.id,
      },
      data: {
        expired: true,
        expiredAt: new Date(),
      },
    });
  }

  const inviteCode = createRandomCode();
  await client.invite.create({
    data: {
      senderId: from.id,
      email,
      inviteCode,
    },
  });
  return inviteCode;
};

const acceptInvite = async (inviteCode: string, email: string) => {
  const invite = await client.invite.findFirst({
    where: {
      email,
      inviteCode,
      expired: false,
    },
  });
  logger.trace({ fn: 'acceptInvite', inviteCode, email, invite }, 'invites::acceptInvite');
  if (!invite) {
    throw Error('Invite code invalid');
  }

  email = email.toLowerCase();

  const user = await client.user.findFirst({
    where: {
      email,
    },
  });
  if (user) {
    throw Error('User already exists');
  }

  const newUser = await client.user.create({
    data: {
      email,
    },
  });

  return newUser;
};

export { inviteUser, acceptInvite };
