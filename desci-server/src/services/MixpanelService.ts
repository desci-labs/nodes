import Mixpanel from 'mixpanel';

import { logger } from '../logger.js';

export class MixpanelService {
  private client: Mixpanel.Mixpanel;
  public isEnabled: boolean;

  constructor() {
    this.isEnabled = process.env.MIXPANEL_TOKEN !== undefined;
    if (this.isEnabled) {
      this.client = Mixpanel.init(process.env.MIXPANEL_TOKEN || '');
      logger.info('Mixpanel is enabled');
    } else {
      logger.info('Mixpanel is disabled, no token provided');
    }
  }

  /**
   * Track an event in Mixpanel
   * @param event The name of the event to track
   * @param properties Additional properties to send with the event
   * @remarks Properties are automatically enriched with:
   * - source: 'desci-server'
   * - $user_id: First available ID from properties.userId, properties.ownerId, or properties.existingUserId
   */
  track(event: string, properties?: any): void {
    if (this.isEnabled) {
      try {
        if (properties) {
          const enrichedProperties = {
            ...properties,
            source: 'desci-server',
          };

          // Set $user_id if any of the user IDs are present
          if (properties?.userId || properties?.ownerId || properties?.existingUserId) {
            enrichedProperties.$user_id = properties.userId || properties.ownerId || properties.existingUserId;
          }

          this.client.track(event, enrichedProperties);
        } else {
          // Handle case when no properties exist
          this.client.track(event, { source: 'desci-server' });
        }
      } catch (e) {
        logger.error({ e }, '[Mixpanel] Error tracking event');
      }
    }
  }
}

export const mixpanel = new MixpanelService();
