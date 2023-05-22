import { ActionType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import { saveInteraction } from 'services/interactionLog';

export const consent = async (req: Request, res: Response, next: NextFunction) => {
  let user = (req as any).user;
  await saveInteraction(
    req,
    ActionType.USER_TERMS_CONSENT,
    {
      ...req.body,
    },
    user?.id,
  );
  res.send({ ok: true });
};
