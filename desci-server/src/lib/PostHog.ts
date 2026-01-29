import { PostHog } from 'posthog-node';

import { logger } from '../logger.js';

let client: PostHog | null = null;

const initPostHog = (): void => {
  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!apiKey) {
    logger.warn('[PostHog] POSTHOG_API_KEY not set, analytics disabled');
    return;
  }

  client = new PostHog(apiKey, { host });
  client.on('error', (err) => logger.error({ err }, '[PostHog] Error'));
  logger.info('[PostHog] Client initialized');
};

// Initialize on module load
initPostHog();

export const capturePostHogEvent = (
  userId: string | number,
  event: string,
  properties: Record<string, unknown> = {},
): void => {
  if (!client) return;

  client.capture({
    distinctId: String(userId),
    event,
    properties,
  });
};

export const updatePostHogUserProperties = (
  userId: string | number,
  properties: Record<string, unknown>,
): void => {
  if (!client) return;

  client.identify({
    distinctId: String(userId),
    properties,
  });
};

export const shutdownPostHog = async (): Promise<void> => {
  if (client) await client.shutdown();
};
