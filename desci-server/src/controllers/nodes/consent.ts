import { ActionType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import _ from 'lodash';
import { z as zod } from 'zod';

import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { logger } from '../../logger.js';
import { getUserConsent, getUserPublishConsent, saveInteraction } from '../../services/interactionLog.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

export const consent = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  await saveInteraction(
    req,
    ActionType.USER_TERMS_CONSENT,
    {
      ...req.body,
      email: user?.email,
    },
    user?.id,
  );
  res.send({ ok: true });
};

export const checkUserConsent = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const consent = await getUserConsent(user.id);
  res.send({ ok: true, consent });
};

export const publishConsentSchema = zod.object({
  body: zod.object({
    uuid: zod.string(),
    version: zod.coerce.number(),
    dontShowAgain: zod.boolean(),
  }),
});

export const publishConsent = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  await saveInteraction(
    req,
    ActionType.USER_PUBLISH_CONSENT,
    {
      ...req.body,
      email: user?.email,
    },
    user?.id,
  );

  new SuccessMessageResponse().send(res);
};

export const checkPublishConsentSchema = zod.object({
  params: zod.object({
    uuid: zod.string(),
  }),
});

export const checkUserPublishConsent = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const { uuid } = req.params;

  let consents = await getUserPublishConsent(user.id);
  logger.info({ consents: consents.length, user: user.id }, 'USER_PUBLISH_CONSENT');
  consents = consents.filter((consent) => {
    const data = JSON.parse(consent.extra);
    const consentUuid = ensureUuidEndsWithDot(data?.uuid ?? '');
    logger.info({ consent: consents.length, data, consentUuid, uuid }, 'USER_PUBLISH_CONSENT');
    if (consentUuid === ensureUuidEndsWithDot(uuid)) return true;
    return false;
  });

  logger.info({ consents: consents.length }, 'FILTERED:USER_PUBLISH_CONSENT');
  const consent = consents[consents.length - 1];
  const extra = consent?.extra ? JSON.parse(consent.extra) : {};
  logger.info({ consent, extra }, 'USER_PUBLISH_CONSENT');
  new SuccessResponse({ consent: !!consent, dontShowAgain: extra?.dontShowAgain ?? false }).send(res);
};
