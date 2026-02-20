import { Request, Response } from 'express';
import { errWithCause } from 'pino-std-serializers';

import { logger as parentLogger } from '../../logger.js';
import {
  handleWebhookEvent,
  verifyWebhookSecret,
  type RevenueCatWebhookPayload,
} from '../../services/RevenueCatService.js';

const logger = parentLogger.child({ module: 'REVENUECAT_WEBHOOK' });

export {
  REVENUECAT_SUBSCRIPTION_CACHE_PREFIX,
  type MobileSubscriptionDetails,
} from '../../services/RevenueCatService.js';
export { REVENUECAT_ENTITLEMENT_ID } from '../../config.js';

export const handleRevenueCatWebhook = async (req: Request, res: Response) => {
  logger.info('Received RevenueCat webhook');
  const sig = req.headers['authorization'];

  if (!verifyWebhookSecret(sig as string | undefined)) {
    logger.error('Invalid or missing webhook authorization');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = req.body as RevenueCatWebhookPayload;
    logger.info({ payload }, 'RevenueCat webhook payload');

    const result = await handleWebhookEvent(payload);

    if (result.ok === false) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(200).json({ ok: true });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ err: errWithCause(error) }, 'Error handling RevenueCat webhook');
    return res.status(500).send({ error: 'Internal server error' });
  }
};
