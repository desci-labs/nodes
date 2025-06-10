import { JournalRevisionStatus, Prisma, SubmissionStatus } from '@prisma/client';
import { err, ok } from 'neverthrow';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';

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
}) {
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
