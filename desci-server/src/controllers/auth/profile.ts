import { Wallet } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';

export const profile = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const wallets = await prisma.wallet.findMany({
    where: { userId: user.id },
  });

  // walletAddress: user.walletAddress, orcid: user.orcid
  const extra = {
    profile: {
      name: user.name,
      googleScholarUrl: user.googleScholarUrl,
      orcid: user.orcid,
    },
  };
  try {
    (extra as any).vscode = user.canRunCode ? process.env.VSCODE_ACCESS_TOKEN : undefined;
  } catch (err) {
    console.error('could not set vscode due to db migration');
  }
  res.send({
    userId: user.id,
    email: user.email,
    wallets: wallets.map((w: Wallet) => ({
      address: w.address,
      nickname: w.nickname,
      extra: w.giftTransaction,
    })),
    ...extra,
  });
};
