import { Request, Response } from 'express';

import { logger as parentLogger } from '../../../logger.js';
import { PublishedWalletService } from '../../../services/PublishedWalletService.js';

export const getUserPublishedWallets = async (req: Request, res: Response) => {
  const user = (req as any).user;

  const logger = parentLogger.child({
    module: 'CONTROLLERS::PublishedWalletIndexController',
    userId: user.id,
  });
  logger.info('Getting published wallets for user');

  try {
    const wallets = await PublishedWalletService.getPublishedWalletsByUser(user.id);

    const walletsResp = wallets.map((wallet) => ({
      id: wallet.id,
      pubKey: wallet.pubKey,
      nodeUuid: wallet.nodeUuid,
      provider: wallet.provider,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    }));

    return res.status(201).json({ ok: true, message: 'Bookmark created successfully', wallets: walletsResp });
  } catch (e) {
    logger.error({ e }, 'Failed retrieving published wallets for user');
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
