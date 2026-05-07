import { Request, Response } from 'express';

import { sendError, sendSuccess } from '../../core/api.js';
import { logger as parentLogger } from '../../logger.js';
import { getNewSciweaveUsersInRange } from '../../services/user.js';

const logger = parentLogger.child({ module: 'InternalSciweaveSignups' });

const MAX_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * GET /v1/internal/sciweave/signups?since=<ISO date>
 *
 * Counts new sciweave users created at or after `since` (defaults to 24h ago).
 * "New sciweave user" matches the existing admin analytics definition: a User
 * with an InteractionLog entry of action=USER_SIGNUP_SUCCESS and
 * extra->>'isSciweave' = 'true', joined on User.createdAt within the window.
 *
 * Auth: X-Internal-Secret header (validated by ensureInternalSecret middleware
 * on the route). Used by the sciweave-web admin Telegram bot's /status command.
 */
export const getSciweaveSignupCount = async (req: Request, res: Response) => {
  const sinceParam = typeof req.query.since === 'string' ? req.query.since : undefined;
  const now = new Date();
  let since: Date;
  if (sinceParam) {
    since = new Date(sinceParam);
    if (Number.isNaN(since.getTime())) {
      return sendError(res, "Invalid 'since' query param — must be an ISO date", 400);
    }
  } else {
    since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  // Cap lookback to 90d to keep the query bounded.
  const earliest = new Date(now.getTime() - MAX_LOOKBACK_MS);
  if (since < earliest) since = earliest;

  try {
    const users = await getNewSciweaveUsersInRange({ from: since, to: now });
    return sendSuccess(res, { count: users.length, since: since.toISOString(), to: now.toISOString() });
  } catch (err) {
    logger.error({ err, since }, 'getSciweaveSignupCount failed');
    return sendError(res, 'Internal error', 500);
  }
};
