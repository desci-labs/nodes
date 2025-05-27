import { PrismaClient, JournalEventLogAction, Journal, RefereeAssignment, RefereeInvite } from '@prisma/client';
import { ok, err, Result } from 'neverthrow';

import { logger } from '../../logger.js';

const prisma = new PrismaClient();

const DEFAULT_REVIEW_DUE_DATE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

type InviteRefereeInput = {
  submissionId: number;
  refereeUserId?: number;
  managerId: number; // Editor who is inviting the referee
};

/**
 * Invite a referee with an already existing user account.
 */
async function inviteReferee(data: InviteRefereeInput): Promise<Result<RefereeInvite, Error>> {
  try {
    const referee = await prisma.user.findUnique({
      where: { id: data.refereeUserId },
    });
    if (!referee) {
      return err(new Error('Referee not found'));
    }

    const submission = await prisma.journalSubmission.findUnique({
      where: { id: data.submissionId },
    });

    if (!submission) {
      return err(new Error('Submission not found'));
    }

    const token = crypto.randomUUID();

    const refereeInvite = await prisma.refereeInvite.create({
      data: {
        userId: referee.id,
        submissionId: data.submissionId,
        email: referee.email,
        invitedById: data.managerId,
        token,
        expiresAt: new Date(Date.now() + DEFAULT_REVIEW_DUE_DATE),
      },
    });

    await prisma.journalEventLog.create({
      data: {
        journalId: refereeInvite.submissionId,
        action: JournalEventLogAction.REFEREE_INVITED,
        userId: refereeInvite.invitedById,
        details: {
          submissionId: refereeInvite.submissionId,
          refereeId: refereeInvite.userId,
          assignedSubmissionEditorId: submission.assignedEditorId,
        },
      },
    });
    return ok(refereeInvite);
  } catch (error) {
    logger.error({ error, data }, 'Failed to invite referee');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred during referee invitation'));
  }
}

type AcceptRefereeInviteInput = {
  inviteToken: string;
  userId: number;
};

async function acceptRefereeInvite(data: AcceptRefereeInviteInput): Promise<Result<RefereeInvite, Error>> {
  try {
    const refereeInvite = await prisma.refereeInvite.findUnique({
      where: { token: data.inviteToken },
    });
    if (!refereeInvite) {
      return err(new Error('Referee invite not found'));
    }

    const inviteIsValid =
      refereeInvite.expiresAt > new Date() && refereeInvite.accepted === null && refereeInvite.declined === null;
    if (!inviteIsValid) {
      return err(new Error('Referee invite not valid'));
    }

    const updatedRefereeInvite = await prisma.refereeInvite.update({
      where: { id: refereeInvite.id },
      data: {
        accepted: true,
        acceptedAt: new Date(),
        userId: data.userId,
      },
    });

    await assignReferee({
      submissionId: refereeInvite.submissionId,
      refereeUserId: data.userId,
      managerId: refereeInvite.invitedById,
    });

    // Acceptance notif to editor

    return ok(updatedRefereeInvite);
  } catch (error) {
    logger.error({ error, data }, 'Failed to accept referee invite');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred during referee invite acceptance'),
    );
  }
}

type AssignRefereeInput = {
  submissionId: number;
  refereeUserId: number;
  managerId: number; // Editor who is assigning the referee
  isReassignment?: boolean;
  dueDate?: Date;
};

async function assignReferee(data: AssignRefereeInput): Promise<Result<RefereeAssignment, Error>> {
  if (!data.dueDate) {
    data.dueDate = new Date(Date.now() + DEFAULT_REVIEW_DUE_DATE);
  }
  try {
    const submission = await prisma.journalSubmission.findUnique({
      where: { id: data.submissionId },
    });
    if (!submission) {
      return err(new Error('Submission not found'));
    }

    const referee = await prisma.user.findUnique({
      where: { id: data.refereeUserId },
    });
    if (!referee) {
      return err(new Error('Referee not found'));
    }

    const [refereeAssignment] = await prisma.$transaction([
      prisma.refereeAssignment.create({
        data: {
          submissionId: data.submissionId,
          refereeId: data.refereeUserId,
          assignedById: data.managerId,
          assignedAt: new Date(),
          ...(data.isReassignment ? { reassignedAt: new Date() } : {}), // Indicate if its a reassignment
          dueDate: data.dueDate,
        },
      }),
      prisma.journalEventLog.create({
        data: {
          journalId: submission.journalId,
          action: JournalEventLogAction.REFEREE_ACCEPTED,
          userId: data.refereeUserId,
          details: {
            submissionId: submission.id,
            assigningEditorUserId: data.managerId,
            currentEditorId: submission.assignedEditorId,
          },
        },
      }),
    ]);
    return ok(refereeAssignment);
  } catch (error) {
    logger.error({ error, data }, 'Failed to assign referee');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred during referee assignment'));
  }
}

type DeclineRefereeInviteInput = {
  inviteToken: string;
  userId?: number; // Don't need to be authed to decline an invite
};

async function declineRefereeInvite(data: DeclineRefereeInviteInput): Promise<Result<RefereeInvite, Error>> {
  try {
    const refereeInvite = await prisma.refereeInvite.findUnique({
      where: { token: data.inviteToken },
    });
    if (!refereeInvite) {
      return err(new Error('Referee invite not found'));
    }

    const inviteIsValid =
      refereeInvite.expiresAt > new Date() && refereeInvite.accepted === null && refereeInvite.declined === null;
    if (!inviteIsValid) {
      return err(new Error('Referee invite not valid'));
    }

    const updatedRefereeInvite = await prisma.refereeInvite.update({
      where: { id: refereeInvite.id },
      data: {
        declined: true,
        userId: data.userId,
        declinedAt: new Date(),
      },
    });

    // Emit notif to inform editor that referee declined

    return ok(updatedRefereeInvite);
  } catch (error) {
    logger.error({ error, data }, 'Failed to accept referee invite');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred during referee invite acceptance'),
    );
  }
}

export const JournalRefereeManagementService = {
  //   assignReferee,
  inviteReferee,
  acceptRefereeInvite,
  declineRefereeInvite,
};
