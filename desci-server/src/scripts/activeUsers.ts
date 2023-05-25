import { getEmailsActiveUsersInXDays } from 'services/interactionLog';

(async () => {
  const [users7, users30, users90] = await Promise.all([
    getEmailsActiveUsersInXDays(7),
    getEmailsActiveUsersInXDays(30),
    getEmailsActiveUsersInXDays(90),
  ]);

  console.log('users7', users7);
  console.log('users30', users30);
  console.log('users90', users90);
})();
