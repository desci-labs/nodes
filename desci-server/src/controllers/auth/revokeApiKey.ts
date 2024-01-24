import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
interface RevokeApiKeyResponse {
  ok: boolean;
  memo?: string;
  error?: string;
}

export async function revokeApiKey(req: Request, res: Response<RevokeApiKeyResponse>) {
  const logger = parentLogger.child({
    module: 'AUTH::revokeApiKeyController',
    body: req.body,
    user: { id: (req as any).user?.id },
  });

  try {
    const { memo } = req.body;
    logger.trace({ memo }, '[API KEY] revoke API key');
    const userId = (req as any).user.id;

    if (!memo) return res.status(400).json({ ok: false, error: 'Memo required' });

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        userId: userId,
        memo: memo,
        isActive: true,
      },
    });

    if (!apiKey) return res.status(500).json({ ok: false, error: 'Invalid API Key, ensure the memo is correct.' });

    // Update the key to be inactive
    const updatedApiKey = await prisma.apiKey.update({
      where: {
        id: apiKey.id,
      },
      data: {
        isActive: false,
      },
    });

    logger.trace({ memo }, 'Successfully revoked API key');
    return res.status(200).json({ ok: true, memo });
  } catch (error) {
    logger.error('Error revoking API key:', error);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
