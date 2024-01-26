import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { magicLinkRedeem } from '../../services/auth.js';

import { generateApiKey, hashApiKey } from './utils.js';

interface IssueApiKeyResponse {
  ok: boolean;
  apiKey?: string;
  error?: string;
}

export async function issueApiKey(req: Request, res: Response<IssueApiKeyResponse>) {
  debugger;
  const logger = parentLogger.child({
    module: 'AUTH::issueApiKeyController',
    body: req.body,
    user: { id: (req as any).user?.id },
  });
  logger.trace({}, '[API KEY] Issue API key');

  try {
    const { memo, magicToken } = req.body;
    const user = (req as any).user;
    const createdIp = req.ip;

    if (!memo) return res.status(400).json({ ok: false, error: 'Unique Memo required' });
    if (!magicToken) return res.status(400).json({ ok: false, error: 'Magic Token required' });

    const redeemed = await magicLinkRedeem(user.email, magicToken);
    if (!redeemed) return res.status(400).json({ ok: false, error: 'Magic Token invalid' });

    // Generate a new API key, and hash it for storage
    const newApiKey = generateApiKey();
    const hashedApiKey = hashApiKey(newApiKey);

    // Store the API key in the database
    const apiKey = await prisma.apiKey.create({
      data: {
        memo: memo,
        key: hashedApiKey,
        userId: user.id,
        createdIp: createdIp,
        isActive: true,
      },
    });

    if (!apiKey)
      return res.status(500).json({ ok: false, error: 'Failed issuing API Key, ensure the memo is unique.' });

    logger.trace({ memo }, 'Successfully created API key');
    return res.status(201).json({ ok: true, apiKey: newApiKey });
  } catch (error) {
    logger.error('Error issuing API key:', error);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
