import { logger as parentLogger } from '../logger.js';
import { query } from '../db/index.js';

export const hideEmail = (email: string) => {
  return email.replace(/(.{1,1})(.*)(@.*)/, '$1...$3');
};

const logger = parentLogger.child({ module: 'UserService' });

export async function getUserByOrcId(orcid: string): Promise<any | null> {
  logger.trace({ orcid }, 'user::getUserByOrcId');
  // const user = await prisma.user.findFirst({ where: { orcid } });
  const rows = await query('SELECT * FROM "User" WHERE orcid = $1', [orcid]);
  const user = rows?.[0];
  return user;
}

export async function getUserByEmail(email: string): Promise<any | null> {
  logger.trace({ email: ` ${hideEmail(email)}` }, `user::getUserByEmail`);
  const rows = await query('SELECT * FROM "User" WHERE lower(email) = $1', [email.toLowerCase()]);
  logger.trace({ rowLength: rows?.length }, 'getUserByEmail query');

  const user = rows?.[0];

  return user;
}
