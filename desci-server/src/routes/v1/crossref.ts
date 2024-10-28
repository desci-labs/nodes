// crossref/callback
import { NextFunction, Request, Response, Router } from 'express';

import { handleCrossrefNotificationCallback, RequestWithCrossRefPayload } from '../../controllers/doi/mint.js';
import { AuthFailureError } from '../../core/ApiError.js';
import { logger as parentLogger } from '../../logger.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const logger = parentLogger.child({ module: 'CROSSREF NOTIFICATION' });
const DEFAULT_CROSSREF_ENDPOINT = 'endpoint';
// assert required env are available
if (!process.env.CROSSREF_NOTIFY_ENDPOINT) {
  logger.warn({ using: DEFAULT_CROSSREF_ENDPOINT }, 'Env `CROSSREF_NOTIFY_ENDPOINT` not set.');
}

const notifierEndpoint = process.env.CROSSREF_NOTIFY_ENDPOINT || DEFAULT_CROSSREF_ENDPOINT;

const router = Router();

export const identifyEndpoint = (endpoint: string) => (req: Request, _res: Response, next: NextFunction) => {
  logger.info({ endpoint }, 'identifyEndpoint');
  next();
};

export const ensureCrossrefNotifier = (req: Request, _res: Response, next: NextFunction) => {
  logger.info({ headers: req.headers }, 'CALLBACK MIDDLEWARE');
  // parse the follwing headers and attach it to the request's context;
  // CROSSREF-NOTIFY-ENDPOINT
  // CROSSREF-EXTERNAL-ID
  // CROSSREF-INTERNAL-ID
  // CROSSREF-RETRIEVE-URL
  // CROSSREF-SERVICE-DATE
  // CROSSREF-RETRIEVE-URL-EXPIRATION-DATE

  const payload = {
    notifyEndpoint: req.headers['crossref-notify-endpoint'] as string,
    externalId: req.headers['crossref-external-id'] as string,
    internalId: req.headers['crossref-internal-id'] as string,
    retrieveUrl: req.headers['crossref-retrieve-url'] as string,
    serviceDate: req.headers['crossref-service-date'] as string,
    retrieveUrlExpirationDate: req.headers['crossref-retrieve-url-expiration-date'] as string,
  };

  logger.info({ payload, headers: req.headers, body: req.body }, 'payload');
  // verify notification endpoint
  if (payload.notifyEndpoint !== process.env.CROSSREF_NOTIFY_ENDPOINT) {
    logger.info({ payloadEndpoint: payload.notifyEndpoint, endpoint: notifierEndpoint }, 'INVALID ENDPOINT');
    throw new AuthFailureError();
  }

  (req as RequestWithCrossRefPayload).payload = payload;
  // validate caller is crossref client using provided endpoint and check if
  next();
};

router.post(
  '/crossref/callback',
  [identifyEndpoint('/crossref/callback'), ensureCrossrefNotifier],
  asyncHandler(handleCrossrefNotificationCallback),
);

export default router;
