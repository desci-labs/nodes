import { Response } from 'express';
import { z } from 'zod';

import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { publishSequencer } from '../../../services/PublishServices.js';

const ResumePublishSchema = z
  .object({
    publishStatusId: z.number().optional(),
    commitId: z.string().optional(),
    nodeUuid: z.string().optional(),
    version: z.number().optional(),
  })
  .refine((data) => !!(data.publishStatusId || data.commitId || (data.nodeUuid && data.version)), {
    message: 'Must provide either publishStatusId, commitId, or both nodeUuid and version',
  });

export interface ErrorResponse {
  allStepsSucceeded: false;
  error: string;
  details?: z.ZodIssue[] | string;
}

export const resumePublish = async (
  req: AuthenticatedRequest & { body: z.infer<typeof ResumePublishSchema> },
  res: Response<{ allStepsSucceeded: boolean } | ErrorResponse>,
) => {
  const logger = parentLogger.child({
    module: 'Admin:Publish::resumePublish',
    userId: req.user?.id,
    body: req.body,
  });
  try {
    const args = ResumePublishSchema.parse(req.body);
    logger.debug({ args }, 'Resuming publish');
    const success = await publishSequencer(args);

    return res.status(success ? 200 : 500).json({ allStepsSucceeded: success });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        allStepsSucceeded: false,
        error: 'Invalid request parameters',
        details: error.errors,
      });
    }

    logger.error({ error }, 'Error resuming publish');
    return res.status(500).json({
      allStepsSucceeded: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
