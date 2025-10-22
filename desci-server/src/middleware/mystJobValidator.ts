import { NextFunction, Request, Response } from 'express';

import type { MystImportJob } from '../controllers/nodes/githubMystImport.js';
import { sendError } from '../core/api.js';
import { logger } from '../logger.js';
import { getFromCache } from '../redisClient.js';
import { importTaskService } from '../services/index.js';
import { getNodeByUuid } from '../services/node.js';
import { getUserById } from '../services/user.js';

export const ensureJobInfo = async (req: Request, res: Response, next: NextFunction) => {
  const { jobId } = req.params as { jobId: string };

  try {
    // First try to get from database using ImportTaskService
    const dbTask = await importTaskService.getTaskByJobId(jobId);
    if (dbTask) {
      logger.info({ jobId, uuid: dbTask.nodeUuid }, 'MYST::JobFound in database');

      // Get user from request and node from the task
      const node = await getNodeByUuid(dbTask.nodeUuid);
      const user = await getUserById(dbTask.userId);

      if (!node || !user) {
        return sendError(res, 'User or node not found', 401);
      }

      // Convert database task to job format for compatibility
      (req as any).job = dbTask;
      (req as any).user = user;
      (req as any).node = node;
      return next();
    } else {
      return sendError(res, 'Job not found', 404);
    }
  } catch (error) {
    logger.error({ error, jobId }, 'Error in ensureJobInfo');
    return sendError(res, 'Failed to retrieve job information', 500);
  }
};
