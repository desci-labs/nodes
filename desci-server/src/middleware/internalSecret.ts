import { RequestHandler } from 'express';

import { sendError } from '../core/api.js';

export const ensureInternalSecret: RequestHandler = (req, res, next) => {
  const expected = process.env.INTERNAL_SERVICE_SECRET;
  if (!expected) {
    return sendError(res, 'Internal service secret not configured', 500);
  }

  const provided = req.header('X-Internal-Secret') || req.header('x-internal-secret');
  if (!provided || provided !== expected) {
    return sendError(res, 'Unauthorized', 401);
  }

  next();
};
