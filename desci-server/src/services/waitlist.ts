import { prisma as client } from '../client.js';

const promote = async (id: number): Promise<boolean> => {
  console.log('waitlist::promote', id);

  const waitlist = await client.waitlist.findFirst({
    where: {
      id,
      userId: null,
    },
  });
  if (!waitlist) {
    throw Error('ID not found');
  }
  const user = await client.user.findFirst({
    where: {
      email: waitlist.email,
    },
  });

  if (user) {
    await client.waitlist.update({
      where: {
        id,
      },
      data: {
        userId: user.id,
      },
    });
    return false;
  }
  const newUser = await client.user.create({
    data: {
      email: waitlist.email,
    },
  });

  await client.waitlist.update({
    where: {
      id,
    },
    data: {
      email: waitlist.email,
      userId: newUser.id,
    },
  });
  return true;
};

const addUser = async (email: string): Promise<boolean> => {
  console.log('waitlist::addUser', email);
  email = email.toLowerCase();

  let user = await client.user.findFirst({
    where: {
      email,
    },
  });

  if (!user) {
    user = await client.user.create({
      data: {
        email
      },
    });
  }

  if (user) {
    throw Error('User already exists');
  }

  return true;
};

const list = async () => {
  const waitlist = await client.waitlist.findMany({ where: { userId: null } });
  return waitlist;
};

export { addUser, list, promote };
