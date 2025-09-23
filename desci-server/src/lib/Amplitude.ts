import * as amplitude from '@amplitude/node';
import { Result, ok, err } from 'neverthrow';

import { logger } from '../logger.js';

// Initialize Amplitude client - will be null if env not present
let amplitudeClient: any = null;

const initAmplitude = (): void => {
  const apiKey = process.env.AMPLITUDE_API_KEY;

  if (!apiKey) {
    logger.warn('[Amplitude] AMPLITUDE_API_KEY not found in environment, analytics disabled');
    return;
  }

  try {
    amplitudeClient = amplitude.init(apiKey);
    logger.info('[Amplitude] Client initialized successfully');
  } catch (error) {
    logger.error('[Amplitude] Failed to initialize client:', error);
    amplitudeClient = null;
  }
};

// Initialize on module load
initAmplitude();

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
): Promise<Result<void, string>> => {
  if (!amplitudeClient) {
    // Silently succeed when Amplitude is not configured
    return ok(undefined);
  }

  try {
    await amplitudeClient.identify({
      user_id: String(userId),
      user_properties: properties,
    });

    logger.debug(`[Amplitude] Updated properties for user ${userId}`);
    return ok(undefined);
  } catch (error) {
    const errorMessage = `Failed to update user properties: ${error}`;
    logger.error(`[Amplitude] ${errorMessage}`);
    return err(errorMessage);
  }
};

export const trackEvent = async (
  userId: string | number,
  eventType: string,
  eventProperties: Record<string, unknown> = {},
): Promise<Result<void, string>> => {
  if (!amplitudeClient) {
    // Silently succeed when Amplitude is not configured
    return ok(undefined);
  }

  try {
    await amplitudeClient.track({
      user_id: String(userId),
      event_type: eventType,
      event_properties: eventProperties,
    });

    logger.debug(`[Amplitude] Tracked event "${eventType}" for user ${userId}`);
    return ok(undefined);
  } catch (error) {
    const errorMessage = `Failed to track event: ${error}`;
    logger.error(`[Amplitude] ${errorMessage}`);
    return err(errorMessage);
  }
};

export const isAmplitudeEnabled = (): boolean => {
  return amplitudeClient !== null;
};
