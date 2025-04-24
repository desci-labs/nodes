import Mixpanel from 'mixpanel';

import { logger } from '../logger.js';

export class MixpanelService {
  private client: Mixpanel.Mixpanel;
  public isEnabled: boolean;

  constructor() {
    this.client = Mixpanel.init(process.env.MIXPANEL_TOKEN || '');
    this.isEnabled = process.env.MIXPANEL_TOKEN !== undefined;
    if (this.isEnabled) {
      logger.info('Mixpanel is enabled');
    } else {
      logger.info('Mixpanel is disabled, no token provided');
    }
  }

  track(event: string, properties?: any): void {
    if (this.isEnabled) {
      this.client.track(event, properties);
    }
  }
}

export const mixpanel = new MixpanelService();
