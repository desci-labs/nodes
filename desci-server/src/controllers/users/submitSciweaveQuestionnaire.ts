import { ActionType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { sendError, sendSuccess } from '../../core/api.js';
import { updateUserProperties } from '../../lib/Amplitude.js';
import { logger as parentLogger } from '../../logger.js';
import { UserRole } from '../../schemas/users.schema.js';
import { saveInteraction } from '../../services/interactionLog.js';

export const submitSciweaveQuestionnaire = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;

  const logger = parentLogger.child({ module: 'USERS::submitSciweaveQuestionnaireController', userId: user?.id });

  const { role, discoverySource } = req.body as {
    role: UserRole;
    discoverySource: string;
  };
  try {
    await saveInteraction({
      req,
      action: ActionType.SUBMIT_SCIWEAVE_QUESTIONNAIRE,
      data: {
        role,
        discoverySource,
        email: user?.email,
      },
      userId: user?.id,
      submitToMixpanel: true,
    });

    // Update Amplitude user properties for sciweave app
    const amplitudeResult = await updateUserProperties(user?.id, {
      sciweaveRole: role,
      sciweaveDiscoverySource: discoverySource,
    });

    if (amplitudeResult.isErr()) {
      logger.warn({ error: amplitudeResult.error }, 'Failed to update Amplitude properties');
    }

    return sendSuccess(res, { submitted: true }, 'Sciweave questionnaire submitted successfully.');
  } catch (error) {
    logger.error({ error, userId: user?.id }, 'Failed to submit sciweave questionnaire');
    return sendError(res, 'Failed to submit sciweave questionnaire', 500);
  }
};
