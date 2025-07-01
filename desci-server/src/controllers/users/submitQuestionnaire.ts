import { ActionType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { sendError, sendSuccess } from '../../core/api.js';
import { logger as parentLogger } from '../../logger.js';
import { DiscoverySource } from '../../schemas/users.schema.js';
import { saveInteraction } from '../../services/interactionLog.js';

export const submitQuestionnaire = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;

  const logger = parentLogger.child({ module: 'USERS::submitQuestionnaireController', userId: user?.id });

  const { discoverySource, other } = req.body as {
    discoverySource: DiscoverySource;
    other?: string;
  };
  try {
    await saveInteraction({
      req,
      action: ActionType.SUBMIT_QUESTIONNAIRE,
      data: {
        discoverySource,
        ...(discoverySource === DiscoverySource.OTHER ? { other } : {}),
        email: user?.email,
      },
      userId: user?.id,
      submitToMixpanel: true,
    });

    return sendSuccess(res, { submitted: true }, 'Questionnaire submitted successfully.');
  } catch (error) {
    logger.error({ error, userId: user?.id }, 'Failed to submit questionnaire');
    return sendError(res, 'Failed to submit questionnaire', 500);
  }
};
