import { DiscordNotification } from '@penseapp/discord-notification';

import logger from 'logger';

const discordNotification = new DiscordNotification(
  process.env.SERVER_URL,
  process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL,
);
export const discordNotify = async (message: string) => {
  logger.info(
    {
      module: 'Utils::DiscordUtils',
      fn: 'discordNotify',
      message,
      notificationName: discordNotification.name,
      webhook: discordNotification.webhook,
    },
    'DISCORD NOTIFY',
  );
  await discordNotification.sucessfulMessage().addTitle('Node Updated').addDescription(message).sendMessage();
};
