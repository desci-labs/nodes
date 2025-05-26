import { EditorRole, JournalEventLogAction, SubmissionStatus } from '@prisma/client';

import { prisma } from '../../client.js';
import { ForbiddenError } from '../../core/ApiError.js';
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
    // replace with error class from journals/core/errors.ts
    throw new ForbiddenError('Submission already exists');
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
    select: {
      journal: {
        select: {
          id: true,
          name: true,
        },
      },
      dpid: true,
      version: true,
      status: true,
      id: true,
      authorId: true,
      assignedEditorId: true,
      assignedEditor: {
        select: {
          id: true,
          name: true,
          email: true,
          orcid: true,
        },
      },
    },
    skip: payload.offset,
    take: payload.limit,
  });
}

async function getJournalSubmissions(payload: {
  journalId: number;
  limit: number;
  offset: number;
  filter?: SubmissionStatus[] | undefined;
}) {
  return await prisma.journalSubmission.findMany({
    where: {
      journalId: payload.journalId,
      ...(payload.filter && { status: { in: payload.filter } }),
    },
    skip: payload.offset,
    take: payload.limit,
    select: {
      id: true,
      assignedEditorId: true,
      dpid: true,
      version: true,
      status: true,
      submittedAt: true,
      acceptedAt: true,
      rejectedAt: true,
      doiMintedAt: true,
      doi: true,
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          orcid: true,
        },
      },
      assignedEditor: {
        select: {
          id: true,
          name: true,
          email: true,
          orcid: true,
        },
      },
    },
  });
}

export async function getAssociateEditorSubmissions(payload: {
  assignedEditorId: number;
  journalId: number;
  limit: number;
  offset: number;
}) {
  return await prisma.journalSubmission.findMany({
    where: {
      journalId: payload.journalId,
      OR: [{ assignedEditorId: payload.assignedEditorId }, { status: SubmissionStatus.ACCEPTED }],
    },
    skip: payload.offset,
    take: payload.limit,
    select: {
      id: true,
      assignedEditorId: true,
      dpid: true,
      version: true,
      status: true,
      submittedAt: true,
      acceptedAt: true,
      rejectedAt: true,
      doiMintedAt: true,
      doi: true,
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          orcid: true,
        },
      },
      assignedEditor: {
        select: {
          id: true,
          name: true,
          email: true,
          orcid: true,
        },
      },
    },
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
  getAssociateEditorSubmissions,
};
