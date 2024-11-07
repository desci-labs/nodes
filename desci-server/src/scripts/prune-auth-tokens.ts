import { prisma } from '../client.js';
import { logger } from '../logger.js';
import { asyncMap } from '../utils.js';

const ORCID_DOMAIN = process.env.ORCID_API_DOMAIN || 'sandbox.orcid.org';
const ORCID_CLIENT_ID = process.env.ORCID_CLIENT_ID;
const ORCID_CLIENT_SECRET = process.env.ORCID_CLIENT_SECRET;

export const main = async () => {
  const isDryRun = process.env.DRY_RUN === '1';
  logger.info({ isDryRun }, 'RUNNING SCRIPT');
  const tokens = await prisma.authToken.findMany({});
  logger.info({ tokens: tokens.length });
  const invalidTokens = (
    await asyncMap(tokens, async (authToken) => {
      const url = `https://${ORCID_DOMAIN}/oauth/token`;

      const response = await fetch(url, {
        method: 'post',
        body: `client_id=${ORCID_CLIENT_ID!}&client_secret=${ORCID_CLIENT_SECRET!}&grant_type=refresh_token&refresh_token=${authToken.refreshToken}&revoke_old=false`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      logger.info({ status: response.status, tokenId: authToken.id }, 'CHECK');
      let isRevoked = false;
      if (response.status != 200) {
        const error = (await response.json()) as { error: string; error_description: string };
        if (error.error === 'unauthorized_client') {
          isRevoked = true;
        }
      }
      return { token: authToken, isRevoked };
    })
  ).filter((token) => token.isRevoked);
  logger.info({ revokedTokens: invalidTokens.length }, 'Revoked');

  if (!isDryRun) {
    await prisma.$transaction(invalidTokens.map((token) => prisma.authToken.delete({ where: { id: token.token.id } })));
  }
};

// use first argument as dpid
main()
  .then(() => logger.info({}, 'Script Ran successfully'))
  .catch((err) => console.log('Error running script ', err));
