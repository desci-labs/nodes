import { init, Identify, identify, flush } from '@amplitude/analytics-node';
import { AmplitudeReturn } from '@amplitude/analytics-node/lib/esm/types.js';
import { Result, ok, err } from 'neverthrow';

import { logger } from '../logger.js';

export enum AmplitudeAppType {
  PUBLISH = 'publish',
  SCIWEAVE = 'sciweave',
}

// Initialize Amplitude clients - will be null if env not present
let publishAmplitudeClient: AmplitudeReturn<void> | null = null;
let sciweaveAmplitudeClient: AmplitudeReturn<void> | null = null;

const initAmplitude = (): void => {
  const publishApiKey = process.env.AMPLITUDE_API_KEY_PUBLISH;
  const sciweaveApiKey = process.env.AMPLITUDE_API_KEY_SCIWEAVE;

  if (publishApiKey) {
    try {
      publishAmplitudeClient = init(publishApiKey);
      logger.info('[Amplitude] Publish client initialized successfully');
    } catch (error) {
      logger.error('[Amplitude] Failed to initialize publish client:', error);
      publishAmplitudeClient = null;
    }
  } else {
    logger.warn('[Amplitude] AMPLITUDE_API_KEY_PUBLISH not found in environment, publish analytics disabled');
  }

  if (sciweaveApiKey) {
    try {
      sciweaveAmplitudeClient = init(sciweaveApiKey);
      logger.info('[Amplitude] Sciweave client initialized successfully');
    } catch (error) {
      logger.error('[Amplitude] Failed to initialize sciweave client:', error);
      sciweaveAmplitudeClient = null;
    }
  } else {
    logger.warn('[Amplitude] AMPLITUDE_API_KEY_SCIWEAVE not found in environment, sciweave analytics disabled');
  }
};

// Initialize on module load
initAmplitude();

const getAmplitudeClient = async (appType: AmplitudeAppType): Promise<any> => {
  switch (appType) {
    case AmplitudeAppType.PUBLISH:
      return publishAmplitudeClient;
    case AmplitudeAppType.SCIWEAVE:
      return await sciweaveAmplitudeClient?.promise;
    default:
      return null;
  }
};

export interface UserProperties {
  sciweaveRole?: string;
  sciweaveDiscoverySource?: string;
  publishRole?: string;
  publishDiscoverySource?: string;
  firstName?: string;
  role?: string;
  receiveSciweaveMarketingEmails?: boolean;
  receivePublishMarketingEmails?: boolean;
  [key: string]: unknown;
}

export const updateUserProperties = async ({
  userId,
  deviceId,
  properties,
  appType,
}: {
  userId: string | number;
  deviceId?: string | null;
  properties: UserProperties;
  appType: AmplitudeAppType;
}): Promise<Result<any, string>> => {
  logger.info({ properties, userId }, `[Amplitude] Updating properties for user ${userId} in ${appType} app`);
  try {
    const event = new Identify();
    for (const [k, v] of Object.entries(properties)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event.set(k, v as any);
    }

    const { promise: identifyPromise } = identify(event, {
      device_id: deviceId,
      // user_id: String(userId),
    });

    // Force immediate sending
    flush();

    logger.info(
      {
        identifyPromise: await identifyPromise,
        properties,
      },
      `[Amplitude] Updated properties for user ${userId} in ${appType} app`,
    );

    return ok(await identifyPromise);
  } catch (error) {
    const errorMessage = `Failed to update user properties for ${appType} app: ${error}`;
    logger.error(`[Amplitude] ${errorMessage}`);
    return err(errorMessage);
  }
};

export const trackEvent = async (
  userId: string | number,
  eventType: string,
  appType: AmplitudeAppType,
  eventProperties: Record<string, unknown> = {},
): Promise<Result<void, string>> => {
  const amplitudeClient = await getAmplitudeClient(appType);

  if (!amplitudeClient) {
    // Silently succeed when Amplitude is not configured for this app
    return ok(undefined);
  }

  try {
    const trackResult = await amplitudeClient.track({
      user_id: String(userId),
      event_type: eventType,
      event_properties: eventProperties,
    });

    // Force immediate send
    const flushResult = await amplitudeClient.flush();

    logger.info(`[Amplitude] Tracked event "${eventType}" for user ${userId} in ${appType} app`, {
      trackResult,
      flushResult: flushResult?.length || 0,
    });

    return ok(undefined);
  } catch (error) {
    const errorMessage = `Failed to track event for ${appType} app: ${error}`;
    logger.error(`[Amplitude] ${errorMessage}`);
    return err(errorMessage);
  }
};

export const isAmplitudeEnabled = (appType: AmplitudeAppType): boolean => {
  return getAmplitudeClient(appType) !== null;
};
