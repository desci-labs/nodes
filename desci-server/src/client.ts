import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient(
  process.env.PRISMA_DEBUG ? { log: ['info', 'query', 'warn', 'error'] } : { log: ['warn', 'error'] },
);
