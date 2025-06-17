import { Response } from 'express';

import { SuccessResponse } from '../../../core/ApiResponse.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger } from '../../../logger.js';
import { safePct } from '../../../services/admin/helper.js';
import { getUserRetention } from '../../../services/admin/interactionLog.js';
import { countAllUsers } from '../../../services/user.js';

export const getRetentionMetrics = async (_req: AuthenticatedRequest, res: Response) => {
  logger.trace({ fn: 'getRetentionMetrics' }, 'getRetentionMetrics');

  const [total, day1Retention, day7Retention, day30Retention, day365Retention] = await Promise.all([
    countAllUsers(),
    getUserRetention(1),
    getUserRetention(7),
    getUserRetention(30),
    getUserRetention(365),
  ]);

  const data = {
    day1Retention: safePct(day1Retention, total),
    day7Retention: safePct(day7Retention, total),
    day30Retention: safePct(day30Retention, total),
    day365Retention: safePct(day365Retention, total),
  };
  new SuccessResponse(data).send(res);
};
