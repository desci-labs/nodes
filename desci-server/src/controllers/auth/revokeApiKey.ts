import { Request, RequestHandler, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
type RevokeApiKeyResponse = {
  ok: boolean;
  memo?: string;
  error?: string;
};

type RevokeApiKeyRequestBody = {
  memo: string;
  keyId: number;
};

export async function revokeApiKey(
  req: Request<any, any, RevokeApiKeyRequestBody>,
  res: Response<RevokeApiKeyResponse>,
) {
  const logger = parentLogger.child({
    module: 'AUTH::revokeApiKeyController',
    body: req.body,
    user: { id: (req as any).user?.id },
  });

  try {
    const { memo, keyId } = req.body;
    logger.trace({ memo, keyId }, '[API KEY] revoke API key');
    const userId = (req as any).user.id;

    if (!memo) return res.status(400).json({ ok: false, error: 'Memo required' });

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        userId: userId,
        memo: memo,
        isActive: true,
      },
    });

    if (!apiKey) return res.status(400).json({ ok: false, error: 'Invalid API Key, ensure the memo is correct.' });

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
