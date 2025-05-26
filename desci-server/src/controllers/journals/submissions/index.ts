import { EditorRole, JournalSubmission, SubmissionStatus } from '@prisma/client';
import { NextFunction, Response } from 'express';

import { prisma } from '../../../client.js';
import { sendError, sendSuccess } from '../../../core/api.js';
import { ForbiddenError } from '../../../core/ApiError.js';
import { AuthenticatedRequest, OptionalAuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import {
  assignSubmissionToEditorSchema,
  createJournalSubmissionSchema,
  getAuthorJournalSubmissionsSchema,
  listJournalSubmissionsSchema,
} from '../../../schemas/journals.schema.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';
import { journalSubmissionService } from '../../../services/journals/JournalSubmissionService.js';
import { getPublishedNodeVersionCount } from '../../../services/nodeManager.js';

const logger = parentLogger.child({
  module: 'Journals::SubmissionsController',
});

type CreateSubmissionRequest = ValidatedRequest<typeof createJournalSubmissionSchema, OptionalAuthenticatedRequest>;

export const createJournalSubmissionController = async (req: CreateSubmissionRequest, res: Response) => {
  const { journalId } = req.validatedData.params;
  const { dpid, version } = req.validatedData.body;
  const authorId = req.user?.id;

  const node = await prisma.node.findFirst({
    where: {
      dpidAlias: dpid,
      ownerId: authorId,
    },
  });

  if (!node) {
    return sendError(res, 'Node not found', 404);
  }

  const nodeVersions = await getPublishedNodeVersionCount(node.id);

  if (version > nodeVersions) {
    throw new ForbiddenError('Node version not found');
  }

  const submission = await journalSubmissionService.createSubmission({
    journalId,
    dpid,
    version,
    authorId,
  });

  return sendSuccess(res, { submissionId: submission.id });
};

type ListJournalSubmissionsRequest = ValidatedRequest<typeof listJournalSubmissionsSchema, AuthenticatedRequest>;

export const listJournalSubmissionsController = async (req: ListJournalSubmissionsRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;
    const { limit, offset } = req.validatedData.query;

    const editor = await JournalManagementService.getUserJournalRole(journalId, req.user.id);
    const role = editor.isOk() ? editor.value : undefined;
    let submissions: Partial<JournalSubmission>[] = [];

    if (role === EditorRole.CHIEF_EDITOR) {
      submissions = await journalSubmissionService.getJournalSubmissions({
        journalId,
        limit,
        offset,
      });
    } else if (role === EditorRole.ASSOCIATE_EDITOR) {
      submissions = await journalSubmissionService.getAssociateEditorSubmissions({
        journalId,
        assignedEditorId: req.user.id,
        limit,
        offset,
      });
    } else {
      submissions = await journalSubmissionService.getJournalSubmissions({
        journalId,
        limit,
        offset,
        filter: [SubmissionStatus.ACCEPTED],
      });
    }

    return sendSuccess(res, { submissions, meta: { count: submissions.length, limit, offset } });
  } catch (error) {
    logger.error({ error });
    return sendError(res, 'Failed to retrieve journal submissions', 500);
  }
};

type GetAuthorSubmissionsRequest = ValidatedRequest<typeof getAuthorJournalSubmissionsSchema, AuthenticatedRequest>;

export const getAuthorSubmissionsController = async (req: GetAuthorSubmissionsRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;
    const { limit, offset } = req.validatedData.query;
    const authorId = req.user?.id;

    const submissions = await journalSubmissionService.getAuthorSubmissions({
      journalId,
      authorId,
      limit,
      offset,
    });

    return sendSuccess(res, { submissions, meta: { count: submissions.length, limit, offset } });
  } catch (error) {
    logger.error({ error });
    return sendError(res, 'Failed to retrieve journal submissions', 500);
  }
};

type AssignSubmissionToEditorRequest = ValidatedRequest<typeof assignSubmissionToEditorSchema, AuthenticatedRequest>;

export const assignSubmissionToEditorController = async (req: AssignSubmissionToEditorRequest, res: Response) => {
  try {
    const { journalId, submissionId } = req.validatedData.params;
    const { editorId } = req.validatedData.body;
    const assignerId = req.user?.id;

    const editor = await JournalManagementService.getUserJournalRole(journalId, assignerId);
    if (editor.isErr()) {
      return sendError(res, 'Editor not found', 404);
    }

    if (editor.value !== EditorRole.CHIEF_EDITOR) {
      return sendError(res, 'Only chief editor can assign submissions to editors', 403);
    }

    const submission = await journalSubmissionService.assignSubmissionToEditor({
      assignerId,
      submissionId,
      editorId,
    });

    return sendSuccess(res, { submission });
  } catch (error) {
    logger.error({ error });
    return sendError(res, 'Failed to assign submission to editor', 500);
  }
};
