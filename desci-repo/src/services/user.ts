import { logger as parentLogger } from '../logger.js';
import { query } from '../db/index.js';

export const hideEmail = (email: string) => {
  return email.replace(/(.{1,1})(.*)(@.*)/, '$1...$3');
};

const logger = parentLogger.child({ module: 'UserService' });

export async function getUserByOrcId(orcid: string): Promise<any | null> {
  logger.trace({ fn: 'getUserByOrcId' }, 'user::getUserByOrcId');
  console.log({ fn: 'getUserByOrcId' }, 'user::getUserByOrcId');
  // const user = await prisma.user.findFirst({ where: { orcid } });
  const rows = await query('SELECT * FROM "User" WHERE orcid = $1', [orcid]);
  const user = rows[0];
  console.log({ fn: 'getUserByOrcId' }, 'user::getUserByOrcId');
  return user;
}

export async function getUserByEmail(email: string): Promise<any | null> {
  logger.trace({ fn: 'getUserByEmail' }, `user::getUserByEmail ${hideEmail(email)}`);
  console.log({ email }, 'user::getUserByemail');

  const rows = await query('SELECT * FROM "User" WHERE email = $1', [email]);
  console.log('USER', rows.length);

  const user = rows[0];

  return user;
}
