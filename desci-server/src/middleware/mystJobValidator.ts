import { NextFunction, Request, Response } from 'express';

import type { MystImportJob } from '../controllers/nodes/githubMystImport.js';
import { sendError } from '../core/api.js';
import { logger } from '../logger.js';
import { getFromCache } from '../redisClient.js';
import { getNodeByUuid } from '../services/node.js';
import { getUserById } from '../services/user.js';

export const ensureJobInfo = async (req: Request, res: Response, next: NextFunction) => {
  const { jobId } = req.params as { jobId: string };
  const job = await getFromCache<MystImportJob>(jobId);
  logger.info({ job: { userId: job?.userId, uuid: job?.uuid } }, 'MYST::JobFound');
  if (!job) {
    return sendError(res, 'Job not found', 404);
  }
  const user = await getUserById(job.userId);
  const node = await getNodeByUuid(job.uuid);
  logger.info({ user, node }, 'MYST::UserAndNodeFound');
  if (!user || !node) {
    return sendError(res, 'User or node not found', 401);
  }
  (req as any).job = job;
  (req as any).user = user;
  (req as any).node = node;
  return next();
};
