import { JournalRevisionStatus, JournalSubmissionRevision, Prisma, SubmissionStatus } from '@prisma/client';
import { err, ok, Result } from 'neverthrow';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';
import { EmailTypes, sendEmail } from '../email/email.js';
import { NotificationService } from '../Notifications/NotificationService.js';

import { journalSubmissionService } from './JournalSubmissionService.js';

// function to create revision (submissionId, dpid, version)
async function createRevision({
  submissionId,
  dpid,
  version,
  journalId,
}: {
  submissionId: number;
  dpid: number;
  version: number;
  journalId: number;
}): Promise<Result<JournalSubmissionRevision, Error>> {
  const pendingRevision = await prisma.journalSubmissionRevision.findFirst({
    where: {
      submissionId,
      status: JournalRevisionStatus.PENDING,
    },
  });
  if (pendingRevision) {
    return err(new Error('You have a pending revision. Please wait for it to be reviewed.'));
  }

  const revision = await prisma.journalSubmissionRevision.create({
    data: {
      submissionId,
      dpid,
      version,
      journalId,
      status: JournalRevisionStatus.PENDING,
    },
  });

  try {
    // Notification logic
    const submission = await prisma.journalSubmission.findUnique({
      where: { id: submissionId },
      include: {
        journal: true,
        author: true,
        assignedEditor: true,
      },
    });

    const editor = await prisma.journalEditor.findUnique({
      where: {
        userId_journalId: {
          userId: submission.assignedEditorId,
          journalId,
        },
      },
    });

    const submissionExtendedResult = await journalSubmissionService.getSubmissionExtendedData(submissionId);
    if (submissionExtendedResult.isErr()) {
      throw new Error('Failed to get submission extended data');
    }
    const submissionExtended = submissionExtendedResult.value;

    await NotificationService.emitOnRevisionSubmittedToEditor({
      journal: submission.journal,
      editor,
      submission: submission,
      submissionTitle: submissionExtended.title,
      author: submission.author,
    });
    sendEmail({
      type: EmailTypes.REVISION_SUBMITTED,
      payload: {
        email: submission.assignedEditor.email,
        journal: submission.journal,
        submission: submissionExtended,
      },
    });
  } catch (e) {
    logger.error({ fn: 'createRevision', error: e, submissionId }, 'Notification push failed');
  }

  return ok(revision);
}

// function to updateRevision status (revisionId, status)
async function updateRevisionStatus({ revisionId, status }: { revisionId: number; status: JournalRevisionStatus }) {
  const revision = await prisma.journalSubmissionRevision.update({
    where: { id: revisionId },
    data: { status },
  });
  return ok(revision);
}

// function to get submission revisions (submissionId)
async function getRevisionsBySubmissionId(submissionId: number) {
  const revisions = await prisma.journalSubmissionRevision.findMany({
    where: { submissionId },
    orderBy: { submittedAt: 'desc' },
  });
  return ok(revisions);
}

// function to get revision by id (revisionId)
async function getRevisionById(revisionId: number) {
  const revision = await prisma.journalSubmissionRevision.findUnique({
    where: { id: revisionId },
  });
  return ok(revision);
}

export const JournalRevisionService = {
  createRevision,
  updateRevisionStatus,
  getRevisionsBySubmissionId,
  getRevisionById,
};
