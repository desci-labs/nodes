import { JournalEventLogAction, RefereeAssignment, RefereeInvite } from '@prisma/client';
import { ok, err, Result } from 'neverthrow';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { NotificationService } from '../Notifications/NotificationService.js';

const logger = parentLogger.child({
  module: 'Journals::JournalRefereeManagementService',
});

const DEFAULT_INVITE_DUE_DATE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const DEFAULT_REVIEW_DUE_DATE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const MAX_ASSIGNED_REFEREES = 3;

type InviteRefereeInput = {
  submissionId: number;
  refereeUserId?: number;
  managerId: number; // Editor who is inviting the referee
  dueDate?: Date;
};

/**
 * Invite a referee with an already existing user account.
 */
async function inviteReferee(data: InviteRefereeInput): Promise<Result<RefereeInvite, Error>> {
  try {
    logger.trace({ fn: 'inviteReferee', data }, 'Inviting referee');
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

    const refereeInvite = await prisma.$transaction(async (tx) => {
      const relativeDueDateHrs = DEFAULT_REVIEW_DUE_DATE / (60 * 60 * 1000); // ms to hours conversion
      const invite = await tx.refereeInvite.create({
        data: {
          userId: referee.id,
          submissionId: data.submissionId,
          email: referee.email,
          invitedById: data.managerId,
          token,
          expiresAt: new Date(Date.now() + DEFAULT_INVITE_DUE_DATE),
          relativeDueDateHrs: relativeDueDateHrs,
        },
      });

      await tx.journalEventLog.create({
        data: {
          journalId: invite.submissionId,
          action: JournalEventLogAction.REFEREE_INVITED,
          userId: invite.invitedById,
          details: {
            submissionId: invite.submissionId,
            refereeId: invite.userId,
            assignedSubmissionEditorId: submission.assignedEditorId,
            relativeDueDateHrs,
          },
        },
      });
      return invite;
    });
    logger.info({ fn: 'inviteReferee', data, refereeInviteId: refereeInvite.id }, 'Invited referee');
    return ok(refereeInvite);
  } catch (error) {
    logger.error({ error, data }, 'Failed to invite referee');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred during referee invitation'));
  }
}

/**
 * Get all referee assignments for a submission that are either complete, or in progress.
 * Does not retrieve assignments that have been dropped out. (completedAssignment === false)
 */
async function getActiveRefereeAssignments(submissionId: number): Promise<Result<RefereeAssignment[], Error>> {
  try {
    const refereeAssignments = await prisma.refereeAssignment.findMany({
      where: {
        submissionId,
        // CompletedAssignment is only false if the referee drops out.
        OR: [{ completedAssignment: true }, { completedAssignment: null }],
      },
    });
    return ok(refereeAssignments);
  } catch (error) {
    logger.error({ error, submissionId }, 'Failed to get active referee assignments');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred during referee assignment retrieval'),
    );
  }
}

/**
 * Get all referee assignments for a submission that are either complete, or in progress.
 * Does not retrieve assignments that have been dropped out. (completedAssignment === false)
 */
async function getRefereeAssignments(refereeId: number): Promise<Result<RefereeAssignment[], Error>> {
  try {
    const refereeAssignments = await prisma.refereeAssignment.findMany({
      where: {
        refereeId,
        // CompletedAssignment is only false if the referee drops out.
        OR: [{ completedAssignment: true }, { completedAssignment: null }],
      },
    });
    return ok(refereeAssignments);
  } catch (error) {
    logger.error({ error, refereeId }, 'Failed to get active referee assignments');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred during referee assignment retrieval'),
    );
  }
}

type AcceptRefereeInviteInput = {
  inviteToken: string;
  userId: number;
};

async function acceptRefereeInvite(data: AcceptRefereeInviteInput): Promise<Result<RefereeInvite, Error>> {
  try {
    logger.trace({ fn: 'acceptRefereeInvite', data }, 'Accepting referee invite');
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

    const refereeUser = await prisma.user.findUnique({
      where: { id: refereeInvite.userId },
    });
    if (!refereeUser) {
      return err(new Error('Referee not found'));
    }

    const submission = await prisma.journalSubmission.findUnique({
      where: { id: refereeInvite.submissionId },
      include: {
        journal: true,
        node: true,
      },
    });
    if (!submission) {
      return err(new Error('Submission not found'));
    }

    const activeRefereeAssignments = await getActiveRefereeAssignments(refereeInvite.submissionId);
    if (activeRefereeAssignments.isErr()) {
      return err(activeRefereeAssignments.error);
    }
    if (activeRefereeAssignments.value.length >= MAX_ASSIGNED_REFEREES) {
      // Invalidate invite
      await prisma.refereeInvite.update({
        where: { id: refereeInvite.id },
        data: {
          declined: true,
          declinedAt: new Date(),
        },
      });
      // Note: We could consider handling this differently.
      logger.info({ fn: 'acceptRefereeInvite', data }, 'Maximum number of referees already assigned');
      return err(new Error('Maximum number of referees already assigned'));
    }

    const updatedRefereeInvite = await prisma.refereeInvite.update({
      where: { id: refereeInvite.id },
      data: {
        accepted: true,
        acceptedAt: new Date(),
        userId: data.userId,
      },
    });

    const relativeDueDateHrs = refereeInvite.relativeDueDateHrs;

    await assignReferee({
      submissionId: refereeInvite.submissionId,
      refereeUserId: data.userId,
      managerId: refereeInvite.invitedById,
      dueDateHrs: relativeDueDateHrs,
      journalId: submission.journalId,
    });

    if (submission.assignedEditorId) {
      const dueDate = new Date(Date.now() + refereeInvite.relativeDueDateHrs * 60 * 60 * 1000); // hours to ms conversion
      // Acceptance notif to editor
      NotificationService.emitOnRefereeAcceptance({
        journal: submission.journal,
        submission: submission,
        submissionTitle: submission.node.title,
        referee: refereeUser,
        dueDate,
        refereeInvite: updatedRefereeInvite,
      });
      // TODO: Send email to editor
      // TODO: Notify author of status change (Under review)
    }

    logger.info(
      { fn: 'acceptRefereeInvite', data, refereeInviteId: updatedRefereeInvite.id },
      'Accepted referee invite',
    );
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
  dueDateHrs: number;
  journalId: number;
};

async function assignReferee(data: AssignRefereeInput): Promise<Result<RefereeAssignment, Error>> {
  try {
    logger.trace({ fn: 'assignReferee', data }, 'Assigning referee');
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

    const relativeDueDateMs = data.dueDateHrs * 60 * 60 * 1000; // hours to ms conversion
    const dueDate = new Date(Date.now() + relativeDueDateMs);

    const [refereeAssignment] = await prisma.$transaction([
      prisma.refereeAssignment.create({
        data: {
          submissionId: data.submissionId,
          refereeId: data.refereeUserId,
          assignedById: data.managerId,
          assignedAt: new Date(),
          ...(data.isReassignment ? { reassignedAt: new Date() } : {}), // Indicate if its a reassignment
          dueDate,
          journalId: data.journalId,
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
            dueDate: dueDate.toISOString(),
          },
        },
      }),
    ]);
    logger.info({ fn: 'assignReferee', data, refereeAssignmentId: refereeAssignment.id }, 'Assigned referee');
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
    logger.trace({ fn: 'declineRefereeInvite', data }, 'Declining referee invite');
    const refereeInvite = await prisma.refereeInvite.findUnique({
      where: { token: data.inviteToken },
      include: {
        submission: {
          include: {
            journal: true,
            node: true,
          },
        },
      },
    });
    if (!refereeInvite) {
      return err(new Error('Referee invite not found'));
    }

    // Not an expectation, as they can decline without a user account.
    const refereeUser =
      data.userId || refereeInvite.userId
        ? await prisma.user.findUnique({
            where: { id: data.userId || refereeInvite.userId },
          })
        : null;

    const submission = refereeInvite.submission;
    const journal = submission.journal;

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

    if (submission.assignedEditorId) {
      // Emit notif to inform editor that referee declined
      NotificationService.emitOnRefereeDecline({
        journal: submission.journal,
        submission: submission,
        submissionTitle: submission.node.title,
        referee: refereeUser,
        refereeInvite,
      });
      // TODO: Send email to editor
    }

    logger.info(
      { fn: 'declineRefereeInvite', data, refereeInviteId: updatedRefereeInvite.id },
      'Declined referee invite',
    );
    return ok(updatedRefereeInvite);
  } catch (error) {
    logger.error({ error, data }, 'Failed to accept referee invite');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred during referee invite acceptance'),
    );
  }
}

/**
 * Invalidates a referee assignment.
 * This can happen when:
 ** Editor manually removes a referee
 ** Reassignment due to deadline reached
 ** Referee drops out
 */
export async function invalidateRefereeAssignment(assignmentId: number): Promise<Result<RefereeAssignment, Error>> {
  try {
    logger.trace({ fn: 'invalidateRefereeAssignment', assignmentId }, 'Invalidating referee assignment');
    const updatedRefereeAssignment = await prisma.$transaction(async (tx) => {
      const assignment = await tx.refereeAssignment.update({
        where: { id: assignmentId },
        data: { completedAssignment: false },
      });

      await tx.journalEventLog.create({
        data: {
          journalId: assignment.submissionId,
          action: JournalEventLogAction.REFEREE_ASSIGNMENT_DROPPED,
          userId: assignment.refereeId,
          details: {
            submissionId: assignment.submissionId,
            refereeId: assignment.refereeId,
            assignedEditorId: assignment.assignedById,
          },
        },
      });
      return assignment;
    });
    logger.info({ fn: 'invalidateRefereeAssignment', assignmentId }, 'Invalidated referee assignment');

    return ok(updatedRefereeAssignment);
  } catch (error) {
    logger.error({ error, assignmentId }, 'Failed to invalidate referee assignment');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred during referee assignment invalidation'),
    );
  }
}

export const JournalRefereeManagementService = {
  inviteReferee,
  acceptRefereeInvite,
  declineRefereeInvite,
  getRefereeAssignments,
  invalidateRefereeAssignment,
};
