import { EditorRole, JournalEventLogAction, SubmissionStatus } from '@prisma/client';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

// import { JournalEventLogService } from './JournalEventLogService.js';
// import { AuthFailureError, ForbiddenError } from '../../core/ApiError.js';

const logger = parentLogger.child({
  module: 'Journals::JournalInviteService',
});

async function createSubmission(payload: { journalId: number; authorId: number; dpid: number; version: number }) {
  const existing = await prisma.journalSubmission.findFirst({
    where: {
      dpid: payload.dpid,
      journalId: payload.journalId,
    },
  });

  if (existing) {
    throw new Error('Submission already exists');
  }

  const submission = await prisma.journalSubmission.create({
    data: { ...payload, status: SubmissionStatus.SUBMITTED },
  });

  return submission;
}

async function getAuthorSubmissions(payload: { journalId: number; authorId: number; limit: number; offset: number }) {
  return await prisma.journalSubmission.findMany({
    where: {
      journalId: payload.journalId,
      authorId: payload.authorId,
    },
    skip: payload.offset,
    take: payload.limit,
  });
}

async function getJournalSubmissions(payload: {
  journalId: number;
  limit: number;
  offset: number;
  filter: SubmissionStatus[] | undefined;
}) {
  return await prisma.journalSubmission.findMany({
    where: {
      journalId: payload.journalId,
      ...(payload.filter && { status: { in: payload.filter } }),
    },
    skip: payload.offset,
    take: payload.limit,
  });
}

async function assignSubmissionToEditor(payload: { assignerId: number; submissionId: number; editorId: number }) {
  const chiefEditor = await prisma.journalEditor.findFirst({
    where: { id: payload.assignerId, role: EditorRole.CHIEF_EDITOR },
  });

  if (!chiefEditor) {
    throw new Error('Only Chief editor is allowed to assign submissions');
  }

  const submission = await prisma.journalSubmission.findUnique({
    where: { id: payload.submissionId },
  });

  if (!submission) {
    throw new Error('Submission not found');
  }

  if (submission.status !== SubmissionStatus.SUBMITTED) {
    throw new Error('Submission is not in the submitted state');
  }

  return await prisma.journalSubmission.update({
    where: { id: payload.submissionId },
    data: {
      assignedEditorId: payload.editorId,
    },
    select: {
      id: true,
      assignedEditorId: true,
      status: true,
    },
  });
}

export const journalSubmissionService = {
  createSubmission,
  getAuthorSubmissions,
  getJournalSubmissions,
  assignSubmissionToEditor,
};
