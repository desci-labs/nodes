import { ActionType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import logger from 'logger';
import { magicLinkRedeem, sendMagicLink } from 'services/auth';
import { saveInteraction } from 'services/interactionLog';

export const generateAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1y' });
};

export const oneYear = 1000 * 60 * 60 * 24 * 365;
export const oneDay = 1000 * 60 * 60 * 24 * 365;
export const magic = async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    logger.info({ fn: 'magic', email: req.body.email }, `magic link requested`);
  } else {
    logger.info({ fn: 'magic', reqBody: req.body }, `magic link ${req.body}`);
  }

  const { email, code, dev } = req.body;
  if (!code) {
    try {
      const ok = await sendMagicLink(email);
      res.send({ ok });
    } catch (err) {
      res.status(400).send({ ok: false, error: err.message });
    }
  } else {
    try {
      const user = await magicLinkRedeem(email, code);
      const token = generateAccessToken({ email: user.email });

      res.cookie('auth', token, {
        maxAge: oneYear,
        httpOnly: true, // Ineffective whilst we still return the bearer token to the client in the response
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.NODE_ENV === 'production' ? '.desci.com' : 'localhost',
        sameSite: 'strict',
      });

      if (dev === 'true') {
        // insecure cookie for local dev, should only be used for testing
        logger.info({ fn: 'magic', email: req.body.email }, `insecure dev cookie set`);
        res.cookie('auth', token, {
          maxAge: oneDay,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          domain: 'localhost', // unsafe
          sameSite: 'strict',
        });
      }

      // TODO: Bearer token still returned for backwards compatability, should look to remove in the future.
      res.send({ ok: true, user: { email: user.email, token } });
      saveInteraction(req, ActionType.USER_LOGIN, { userId: user.id }, user.id);
    } catch (err) {
      res.status(400).send({ ok: false, error: err.message });
    }
  }
};
