import { ActionType, Wallet } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';
import { getUserConsent, getUserQuestionnaireSubmitted, saveInteraction } from '../../services/interactionLog.js';

export const profile = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;

  const [wallets, userOrganizations, consent, questionnaireSubmitted] = await Promise.all([
    prisma.wallet.findMany({ where: { userId: user.id } }),
    prisma.userOrganizations.findMany({
      where: { userId: user.id },
      include: { organization: true },
    }),
    getUserConsent(user.id),
    getUserQuestionnaireSubmitted(user.id),
  ]);

  const extra = {
    profile: {
      name: user.name,
      googleScholarUrl: user.googleScholarUrl,
      orcid: user.orcid,
      userOrganization: userOrganizations.map((org) => org.organization),
      consent: !!consent,
      questionnaireSubmitted: !!questionnaireSubmitted,
      notificationSettings: user.notificationSettings || {},
    },
  };
  try {
    (extra as any).vscode = user.canRunCode ? process.env.VSCODE_ACCESS_TOKEN : undefined;
  } catch (err) {
    logger.error({ fn: 'profile', err }, 'could not set vscode due to db migration');
  }
  await saveInteraction({
    req,
    action: ActionType.USER_ACTION,
    data: { action: 'PROFILE_REQ' },
    userId: user.id,
  });
  res.send({
    userId: user.id,
    email: user.email,
    isGuest: user.isGuest,
    wallets: wallets.map((w: Wallet) => ({
      address: w.address,
      nickname: w.nickname,
      extra: w.giftTransaction,
    })),
    ...extra,
  });
};
