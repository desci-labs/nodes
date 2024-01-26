import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

interface ApiKeyFragment {
  memo: string;
  createdAt: Date;
  lastUsed: Date;
}

interface ListApiKeyResponse {
  ok: boolean;
  apiKeys?: ApiKeyFragment[];
  error?: string;
}

export async function listApiKey(req: Request, res: Response<ListApiKeyResponse>) {
  const logger = parentLogger.child({
    module: 'AUTH::listApiKeyController',
    body: req.body,
    user: { id: (req as any).user?.id },
  });
  logger.trace({}, '[API KEY] list API key');

  try {
    const user = (req as any).user;

    const apiKeys = await prisma.apiKey.findMany({
      select: {
        memo: true,
        createdAt: true,
        lastUsed: true,
      },
      where: {
        userId: user.id,
        isActive: true,
      },
    });

    logger.trace({ apiKeys }, 'Returning users API keys');
    return res.status(200).json({ ok: true, apiKeys: apiKeys });
  } catch (error) {
    logger.error('Error listing API keys:', error);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
