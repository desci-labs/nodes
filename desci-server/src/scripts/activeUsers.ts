import logger from 'logger';
import { getEmailsActiveUsersInXDays } from 'services/interactionLog';

(async () => {
  const [users7, users30, users90] = await Promise.all([
    getEmailsActiveUsersInXDays(7),
    getEmailsActiveUsersInXDays(30),
    getEmailsActiveUsersInXDays(90),
  ]);

  logger.info('users7', users7);
  logger.info('users30', users30);
  logger.info('users90', users90);
})();
