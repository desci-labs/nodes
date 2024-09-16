import { DiscordNotification } from '@penseapp/discord-notification';

import { SERVER_ENV } from '../config/index.js';
import { logger } from '../logger.js';

const doiMintingNotification = new DiscordNotification(
  process.env.SERVER_URL,
  process.env.DISCORD_NOTIFICATIONS_DOI_WEBHOOK_URL,
);

const nodeFeedNotification = new DiscordNotification(
  process.env.SERVER_URL,
  process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL,
);

export enum DiscordNotifyType {
  SUCCESS,
  INFO,
  WARNING,
  ERROR,
}

export enum DiscordChannel {
  NodesFeed,
  DoiMinting,
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
  channel = DiscordChannel.NodesFeed,
}: {
  message: string;
  title?: string;
  type?: DiscordNotifyType;
  channel?: DiscordChannel;
}) => {
  const discordNotification = channel === DiscordChannel.DoiMinting ? doiMintingNotification : nodeFeedNotification;
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
      env: SERVER_ENV,
    },
    'DISCORD NOTIFY',
  );
  await notifier.addTitle(`${title} - ${SERVER_ENV}`).addDescription(message).sendMessage();
};
