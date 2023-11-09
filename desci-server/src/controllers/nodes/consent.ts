import { ActionType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import { getUserConsent, saveInteraction } from 'services/interactionLog';

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
