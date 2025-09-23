import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { sendError } from '../core/api.js';
const MEDIA_SERVER_API_KEY = process.env.MEDIA_SECRET_KEY;

export const ensureApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== MEDIA_SERVER_API_KEY) {
    res.sendStatus(401);
    return;
  }
  next();
};

export const verifyInternalSecret: RequestHandler = (req, res, next) => {
  const expected = process.env.INTERNAL_SERVICE_SECRET;
  if (!expected) {
    return sendError(res, 'Internal service secret not configured', 500);
  }

  const provided = req.header('X-Internal-Secret') || req.header('x-internal-secret');
  if (!provided || provided !== expected) {
    return sendError(res, 'Unauthorized', 401);
  }

  return next();
};
