import { DiscordNotification } from '@penseapp/discord-notification';

const discordNotification = new DiscordNotification(
  process.env.SERVER_URL,
  process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL,
);
export const discordNotify = async (message: string) => {
  console.log('DISCORD NOTIFY', message, discordNotification.name, discordNotification.webhook);
  await discordNotification
    .sucessfulMessage()
    .addTitle('Node Updated')
    .addDescription(message)
    // .addField({ name: 'Field 1', value: 'Content #1', inline: false }) //breakline
    // .addField({ name: 'Field 2', value: 'Content #2' })
    // .addField({ name: 'Field 3', value: 'Content #3' })
    // .addFooter('My footer') // Small text at the end of discord notification
    .sendMessage();
};
