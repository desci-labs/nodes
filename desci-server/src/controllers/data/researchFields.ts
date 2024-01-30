import { ResearchFields } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';

const cache = {};

export const queryResearchFields = async (req: Request, res: Response, next: NextFunction) => {
  const query = req.query?.q as string;
  let results: ResearchFields[] = [];

  if (query && query.length > 0) {
    if (cache[query.trim()]) {
      results = cache[query.trim()];
    } else {
      results = await prisma.researchFields.findMany({
        where: {
          name: { contains: query.trim(), mode: 'insensitive' },
        },
      });
      cache[query.trim()] = results;
    }
  }
  res.send({ data: results, query, success: true });
};
