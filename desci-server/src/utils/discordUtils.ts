import { DiscordNotification } from '@penseapp/discord-notification';

import { logger } from '../logger.js';

const discordNotification = new DiscordNotification(
  process.env.SERVER_URL,
  process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL,
);

export enum DiscordNotifyType {
  SUCCESS,
  INFO,
  WARNING,
  ERROR,
}

type Message =
  | DiscordNotification['sucessfulMessage']
  | DiscordNotification['infoMessage']
  | DiscordNotification['warningMessage']
  | DiscordNotification['errorMessage'];

export const discordNotify = async ({
  message,
  title = 'Node Updated',
  type = DiscordNotifyType.SUCCESS,
}: {
  message: string;
  title?: string;
  type?: DiscordNotifyType;
}) => {
  let notifier: ReturnType<Message>;
  switch (type) {
    case DiscordNotifyType.SUCCESS:
      notifier = discordNotification.sucessfulMessage();
      break;
    case DiscordNotifyType.INFO:
      notifier = discordNotification.infoMessage();
      break;
    case DiscordNotifyType.WARNING:
      notifier = discordNotification.warningMessage();
      break;
    case DiscordNotifyType.ERROR:
      notifier = discordNotification.errorMessage();
      break;
    default:
      notifier = discordNotification.sucessfulMessage();
  }

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
  await notifier.addTitle(title).addDescription(message).sendMessage();
};
