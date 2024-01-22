import { User } from '@prisma/client';
import { logger as parentLogger } from '../logger.js';
import { prisma } from '../client.js';

export const hideEmail = (email: string) => {
  return email.replace(/(.{1,1})(.*)(@.*)/, '$1...$3');
};

const logger = parentLogger.child({ module: 'UserService' });

export async function getUserByOrcId(orcid: string): Promise<User | null> {
  logger.trace({ fn: 'getUserByOrcId' }, 'user::getUserByOrcId');
  const user = await prisma.user.findFirst({ where: { orcid } });

  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  logger.trace({ fn: 'getUserByEmail' }, `user::getUserByEmail ${hideEmail(email)}`);
  const user = await prisma.user.findFirst({ where: { email } });

  return user;
}
