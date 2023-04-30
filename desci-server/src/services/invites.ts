import crypto from 'crypto';

import { User } from '@prisma/client';

import createRandomCode from 'utils/createRandomCode';

import client from '../client';

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
    console.log('invite::inviteUser', invitedEmail, ids);
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
  console.log('invites::acceptInvite', inviteCode, email, invite);
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
