import { EditorRole } from '@prisma/client';
import { NextFunction, Response } from 'express';

import { prisma } from '../client.js';
import { AuthenticatedRequest } from '../core/types.js';
import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({ module: 'MIDDLEWARE::JournalPermissions' });

interface JournalParams {
  journalId: string;
}

export const ensureJournalRole = (requiredRole: EditorRole) => {
  return async (req: AuthenticatedRequest<JournalParams>, res: Response, next: NextFunction) => {
    try {
      const journalId = req.params.journalId;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!journalId) {
        res.status(400).json({ error: 'Bad Request - Journal ID is required' });
        return;
      }

      const editor = await prisma.journalEditor.findUnique({
        where: {
          userId_journalId: {
            userId,
            journalId: parseInt(journalId),
          },
        },
      });

      if (!editor) {
        res.status(403).json({ error: 'Forbidden - Not a journal editor' });
        return;
      }

      if (editor.role !== requiredRole) {
        res.status(403).json({ error: 'Forbidden - Insufficient permissions' });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
