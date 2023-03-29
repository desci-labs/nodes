import { DiscordNotification } from '@penseapp/discord-notification';

const discordNotification = new DiscordNotification(
  process.env.SERVER_URL,
  process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL,
);
export const discordNotify = async (message: string) => {
  console.log('DISCORD NOTIFY', message, discordNotification.name, discordNotification.webhook);
  await discordNotification.sucessfulMessage().addTitle('Node Updated').addDescription(message).sendMessage();
};
