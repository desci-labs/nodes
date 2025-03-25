import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { sendCookie } from '../../utils/sendCookie.js';

import { generateAccessToken } from './magic.js';

const logger = parentLogger.child({ module: '[Auth]::Guest' });

type GuestResponse = {
  ok: boolean;
  user?: {
    email: string;
    token: string;
    isGuest: boolean;
  };
  error?: string;
};

export const createGuestUser = async (req: Request, res: Response): Promise<Response<GuestResponse>> => {
  try {
    debugger;
    const { dev } = req.body;
    const guestEmail = `guest-${uuidv4()}`;

    const user = await prisma.user.create({
      data: {
        email: guestEmail,
        isGuest: true,
      },
    });

    const token = generateAccessToken({ email: user.email, isGuest: true });

    sendCookie(res, token, dev === 'true');

    logger.info({ userId: user.id }, '[GUEST] Guest user created successfully');

    return res.send({
      ok: true,
      user: {
        email: user.email,
        token,
        isGuest: true,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create guest user');
    return res.status(500).send({ ok: false, error: 'Failed to create guest account' });
  }
};
