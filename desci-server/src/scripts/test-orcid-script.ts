import { prisma } from '../client.js';
import { logger } from '../logger.js';

export const main = async () => {
  const targetOrcid = process.argv[2];
  
  if (!targetOrcid) {
    throw new Error('Usage: npm run script:test-orcid <orcid-id>');
  }

  logger.info({ targetOrcid }, 'Testing ORCID script');
  
  // Simple test - just find a user
  const user = await prisma.user.findUnique({
    where: { orcid: targetOrcid }
  });
  
  logger.info({ user: !!user }, 'User found');
};

main()
  .then(() => logger.info({}, 'Script completed successfully'))
  .catch((err) => {
    logger.error({ err }, 'Error running test script');
    console.log('Error running script:', err);
  });