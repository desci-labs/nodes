import { User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import {
  AuthMethods,
  extractApiKey,
  extractAuthToken,
  extractUserFromApiKey,
  extractUserFromToken,
} from './permissions.js';

/**
 * Attaches the user to the request (req.user), the difference between this middleware and ensureUser is that this is optional
 * and won't reject with a 401 if not logged in.
 */
export const attachUser = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['api-key'];

  const token = await extractAuthToken(req);
  const apiKey = apiKeyHeader ? await await extractApiKey(req) : undefined;
  const authTokenRetrieval = await extractUserFromToken(token);
  const apiKeyRetrieval = apiKeyHeader ? await extractUserFromApiKey(apiKey, req.ip) : undefined;

  const retrievedUser = authTokenRetrieval || apiKeyRetrieval;

  if (retrievedUser) {
    (req as any).user = retrievedUser;
    (req as any).authMethod = authTokenRetrieval ? AuthMethods.AUTH_TOKEN : AuthMethods.API_KEY;
  }
  next();
};

export const retrieveUser = async (req: Request): Promise<User | null> => {
  const token = await extractAuthToken(req);
  const retrievedUser = await extractUserFromToken(token);
  return retrievedUser;
};
