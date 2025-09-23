import * as amplitude from '@amplitude/node';
import { Result, ok, err } from 'neverthrow';

import { logger } from '../logger.js';

export enum AmplitudeAppType {
  PUBLISH = 'publish',
  SCIWEAVE = 'sciweave',
}

// Initialize Amplitude clients - will be null if env not present
let publishAmplitudeClient: any = null;
let sciweaveAmplitudeClient: any = null;

const initAmplitude = (): void => {
  const publishApiKey = process.env.AMPLITUDE_API_KEY_PUBLISH;
  const sciweaveApiKey = process.env.AMPLITUDE_API_KEY_SCIWEAVE;

  if (publishApiKey) {
    try {
      publishAmplitudeClient = amplitude.init(publishApiKey);
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
      sciweaveAmplitudeClient = amplitude.init(sciweaveApiKey);
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

const getAmplitudeClient = (appType: AmplitudeAppType): any => {
  switch (appType) {
    case AmplitudeAppType.PUBLISH:
      return publishAmplitudeClient;
    case AmplitudeAppType.SCIWEAVE:
      return sciweaveAmplitudeClient;
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
  receiveSciweaveMarketingEmails?: boolean;
  receivePublishMarketingEmails?: boolean;
  [key: string]: unknown;
}

export const updateUserProperties = async (
  userId: string | number,
  properties: UserProperties,
  appType: AmplitudeAppType,
): Promise<Result<void, string>> => {
  const amplitudeClient = getAmplitudeClient(appType);

  if (!amplitudeClient) {
    // Silently succeed when Amplitude is not configured for this app
    return ok(undefined);
  }

  try {
    await amplitudeClient.identify({
      user_id: String(userId),
      user_properties: properties,
    });

    logger.debug(`[Amplitude] Updated properties for user ${userId} in ${appType} app`);
    return ok(undefined);
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
  const amplitudeClient = getAmplitudeClient(appType);

  if (!amplitudeClient) {
    // Silently succeed when Amplitude is not configured for this app
    return ok(undefined);
  }

  try {
    await amplitudeClient.track({
      user_id: String(userId),
      event_type: eventType,
      event_properties: eventProperties,
    });

    logger.debug(`[Amplitude] Tracked event "${eventType}" for user ${userId} in ${appType} app`);
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
