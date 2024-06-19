// crossref/callback
import { NextFunction, Request, Response, Router } from 'express';

import {
  RequestWithCrossRefPayload,
  asyncHandler,
  handleCrossrefNotificationCallback,
  logger,
} from '../../internal.js';

// assert required env are available
if (!process.env.CROSSREF_NOTIFY_CALLBACK_PATH) throw Error('Env `CROSSREF_NOTIFY_CALLBACK_PATH` not set.');
if (!process.env.CROSSREF_NOTIFY_ENDPOINT) throw Error('Env `CROSSREF_NOTIFY_ENDPOINT` not set.');

const notifierCallbackUrl = process.env.CROSSREF_NOTIFY_CALLBACK_PATH;

const router = Router();

const ensureCrossrefNotifier = (req: Request, _res: Response, next: NextFunction) => {
  // parse the follwing headers and attach it to the request's context;
  // CROSSREF-NOTIFY-ENDPOINT
  // CROSSREF-EXTERNAL-ID
  // CROSSREF-INTERNAL-ID
  // CROSSREF-RETRIEVE-URL
  // CROSSREF-SERVICE-DATE
  // CROSSREF-RETRIEVE-URL-EXPIRATION-DATE

  const payload = {
    notifyEndpoint: req.headers['CROSSREF-NOTIFY-ENDPOINT'] as string,
    externalId: req.headers[' CROSSREF-EXTERNAL-ID'] as string,
    internalId: req.headers['CROSSREF-INTERNAL-ID'] as string,
    retrieveUrl: req.headers['CROSSREF-RETRIEVE-URL'] as string,
    serviceDate: req.headers['CROSSREF-SERVICE-DATE'] as string,
    retrieveUrlExpirationDate: req.headers['CROSSREF-RETRIEVE-URL-EXPIRATION-DATE'] as string,
  };

  logger.info({ payload, headers: req.headers }, 'CROSSREF NOTIFICATION');
  // verify notification endpoint
  if (payload.notifyEndpoint !== process.env.CROSSREF_NOTIFY_ENDPOINT) {
    return;
  }

  (req as RequestWithCrossRefPayload).payload = payload;
  // validate caller is crossref client using provided endpoint and check if
  next();
};

router.post(notifierCallbackUrl, [ensureCrossrefNotifier], asyncHandler(handleCrossrefNotificationCallback));

export default router;
