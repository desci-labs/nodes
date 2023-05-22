import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';

export const ROR_API_URL = 'https://api.ror.org/organizations';

export const queryRor = async (req: Request, res: Response, next: NextFunction) => {
  const query = req.query?.query as string;
  try {
    const { data, status } = await axios.get<any, any>(
      `${ROR_API_URL}?page=1&query=${encodeURIComponent(query.trim())}`,
      {},
    );
    if (status !== 200) {
      res.status(status).send({ ok: false, message: 'Cannot search for organisations, try again later' });
      return;
    }
    const items = data.items;
    res.send({ ok: true, items });
  } catch (e) {
    res.send({ ok: true, items: [] });
  }
};
