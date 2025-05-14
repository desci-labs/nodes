import { EditorRole } from '@prisma/client';
import { NextFunction, Response } from 'express';

import { prisma } from '../client.js';
import { AuthenticatedRequest } from '../core/types.js';
import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({ module: 'MIDDLEWARE::JournalPermissions' });

interface JournalParams {
  journalId: string;
}

export enum JournalRole {
  CHIEF_EDITOR = 'CHIEF_EDITOR',
  ASSOCIATE_EDITOR = 'ASSOCIATE_EDITOR',
  REFEREE = 'REFEREE',
  USER = 'USER',
}

export enum JournalAction {
  INVITE_EDITOR = 'INVITE_EDITOR',
  INVITE_REFEREE = 'INVITE_REFEREE',
  SUBMIT_REVIEW = 'SUBMIT_REVIEW',
  VIEW_STATUS = 'VIEW_STATUS',
}

export type JournalPermissionMatrix = {
  [R in JournalRole]: Partial<Record<JournalAction, boolean>>;
};

export const JournalPermissionMatrix: JournalPermissionMatrix = {
  [JournalRole.CHIEF_EDITOR]: {
    [JournalAction.INVITE_EDITOR]: true,
    [JournalAction.INVITE_REFEREE]: true,
    [JournalAction.SUBMIT_REVIEW]: true,
    [JournalAction.VIEW_STATUS]: true,
  },
  [JournalRole.ASSOCIATE_EDITOR]: {
    [JournalAction.INVITE_REFEREE]: true,
    [JournalAction.SUBMIT_REVIEW]: true,
    [JournalAction.VIEW_STATUS]: true,
  },
  [JournalRole.REFEREE]: {
    [JournalAction.SUBMIT_REVIEW]: true,
    [JournalAction.VIEW_STATUS]: true,
  },
  [JournalRole.USER]: {
    [JournalAction.VIEW_STATUS]: true,
  },
};

export function can(role: JournalRole, action: JournalAction): boolean {
  return JournalPermissionMatrix[role]?.[action] ?? false;
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
