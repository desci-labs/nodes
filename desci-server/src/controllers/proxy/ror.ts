import { Organization } from '@prisma/client';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';

export const ROR_API_URL = 'https://api.ror.org/organizations';
const cache = {};
export const queryRor = async (req: Request, res: Response, next: NextFunction) => {
  const query = req.query?.query as string;
  let results: Organization[] = [];

  try {
    const { data, status } = await axios.get<any, any>(
      `${ROR_API_URL}?page=1&query=${encodeURIComponent(query.trim())}`,
      {},
    );
    if (status !== 200) {
      res.status(status).send({ ok: false, message: 'Cannot search for organisations, try again later' });
    } else {
      results.push(...data.items);
    }
  } catch (e) {
    if (query && query.length > 0) {
      if (cache[query.trim()]) {
        results = cache[query.trim()];
      } else {
        results = await prisma.organization.findMany({
          where: { name: { contains: query.trim(), mode: 'insensitive' } },
        });

        cache[query.trim()] = results;
      }
    }
  }

  res.send({ ok: true, results });
};
