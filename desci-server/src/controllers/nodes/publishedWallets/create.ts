import { WalletProvider } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';

import { logger as parentLogger } from '../../../logger.js';
import { PublishedWalletService } from '../../../services/PublishedWalletService.js';

const AddPublishedWalletSchema = z.object({
  pubKey: z.string().min(1, 'Public key is required'),
  nodeUuid: z.string().min(1, 'Node UUID is required'),
  provider: z.nativeEnum(WalletProvider, {
    errorMap: () => ({ message: `Provider must be one of: ${Object.values(WalletProvider).join(', ')}` }),
  }),
});

export const addPublishedWallet = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const logger = parentLogger.child({
    module: 'CONTROLLERS::AddPublishedWalletController',
    userId: user.id,
  });

  try {
    const validatedData = AddPublishedWalletSchema.parse(req.body);
    logger.info({ validatedData }, 'Adding published wallet');

    const result = await PublishedWalletService.addPublishedWallet({
      pubKey: validatedData.pubKey,
      nodeUuid: validatedData.nodeUuid,
      provider: validatedData.provider,
      userId: user.id,
    });

    const message = result.isNew ? 'Wallet added successfully' : 'Wallet entry already existed';

    return res.status(201).json({
      ok: true,
      message,
      isNew: result.isNew,
      wallet: {
        id: result.wallet.id,
        pubKey: result.wallet.pubKey,
        nodeUuid: result.wallet.nodeUuid,
        provider: result.wallet.provider,
        createdAt: result.wallet.createdAt,
        updatedAt: result.wallet.updatedAt,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      logger.warn({ error: e.errors }, 'Invalid request parameters');
      return res.status(400).json({ ok: false, error: 'Invalid request parameters', details: e.errors });
    }

    logger.error({ e, body: req.body }, 'Failed to add published wallet');
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
