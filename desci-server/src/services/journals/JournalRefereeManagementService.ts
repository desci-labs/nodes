import { EditorRole, JournalEventLogAction, RefereeAssignment, RefereeInvite } from '@prisma/client';
import { ok, err, Result } from 'neverthrow';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { EmailTypes, sendEmail } from '../email/email.js';
import { NotificationService } from '../Notifications/NotificationService.js';

import { journalSubmissionService } from './JournalSubmissionService.js';

const logger = parentLogger.child({
  module: 'Journals::JournalRefereeManagementService',
});

const DEFAULT_INVITE_DUE_DATE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const DEFAULT_REVIEW_DUE_DATE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const DEFAULT_REVIEW_DUE_DATE_HRS = DEFAULT_REVIEW_DUE_DATE / (60 * 60 * 1000); // ms to hours conversion
const MAX_ASSIGNED_REFEREES = 3;

type InviteRefereeInput = {
  submissionId: number;
  refereeUserId?: number;
  managerUserId: number; // Editor who is inviting the referee
  relativeDueDateHrs?: number;
  refereeEmail?: string; // If not an existing user.
  expectedFormTemplateIds?: number[]; // Form templates the referee is expected to complete
};

/**
 * Invite a referee with an already existing user account.
 */
async function inviteReferee(data: InviteRefereeInput): Promise<Result<RefereeInvite, Error>> {
  try {
    if (!data.relativeDueDateHrs) {
      data.relativeDueDateHrs = DEFAULT_REVIEW_DUE_DATE_HRS;
    }
    logger.trace({ fn: 'inviteReferee', data }, 'Inviting referee');
    const existingReferee = data.refereeUserId
      ? await prisma.user.findUnique({
          where: { id: data.refereeUserId },
        })
      : null;

    const submission = await prisma.journalSubmission.findUnique({
      where: { id: data.submissionId },
      include: {
        journal: true,
        node: true,
      },
    });

    if (!submission) {
      return err(new Error('Submission not found'));
    }

    const submissionExtendedResult = await journalSubmissionService.getSubmissionExtendedData(data.submissionId);
    if (submissionExtendedResult.isErr()) {
      return err(submissionExtendedResult.error);
    }
    const submissionExtended = submissionExtendedResult.value;

    const editor = await prisma.journalEditor.findFirst({
      where: {
        userId: data.managerUserId,
        journalId: submission.journalId,
      },
      include: {
        user: true,
      },
    });

    if (!editor) {
      return err(new Error('Editor not found for submission'));
    }

    const refereeEmail = existingReferee?.email ?? data.refereeEmail;
    if (!refereeEmail) {
      return err(new Error('Referee email is required'));
    }

    const token = crypto.randomUUID();

    // Validate expected form templates if provided
    if (data.expectedFormTemplateIds && data.expectedFormTemplateIds.length > 0) {
      const validTemplates = await prisma.journalFormTemplate.findMany({
        where: {
          id: { in: data.expectedFormTemplateIds },
          journalId: submission.journalId,
          isActive: true,
        },
      });

      if (validTemplates.length !== data.expectedFormTemplateIds.length) {
        return err(new Error('One or more form templates are invalid or inactive'));
      }
    }

    const refereeInvite = await prisma.$transaction(async (tx) => {
      //   const relativeDueDateHrs = DEFAULT_REVIEW_DUE_DATE / (60 * 60 * 1000); // ms to hours conversion
      const invite = await tx.refereeInvite.create({
        data: {
          userId: existingReferee?.id ?? null, // If referee doesn't have an account yet, userId is null. (External referee)
          submissionId: data.submissionId,
          email: refereeEmail,
          invitedById: data.managerUserId,
          token,
          expiresAt: new Date(Date.now() + DEFAULT_INVITE_DUE_DATE),
          relativeDueDateHrs: data.relativeDueDateHrs,
          expectedFormTemplateIds: data.expectedFormTemplateIds || [],
        },
      });

      await tx.journalEventLog.create({
        data: {
          journalId: submission.journalId,
          action: JournalEventLogAction.REFEREE_INVITED,
          userId: invite.invitedById,
          details: {
            submissionId: invite.submissionId,
            refereeId: invite.userId,
            refereeEmail,
            assignedSubmissionEditorId: submission.assignedEditorId,
            relativeDueDateHrs: data.relativeDueDateHrs,
          },
        },
      });
      return invite;
    });

    // Send email
    await sendEmail({
      type: EmailTypes.REFEREE_INVITE,
      payload: {
        email: refereeEmail,
        journal: submission.journal,
        inviterName: editor.user.name,
        inviteToken: token,
        refereeName: existingReferee?.name ?? '',
        submission: submissionExtended,
      },
    });
    if (existingReferee) {
      // notification
      await NotificationService.emitOnRefereeInvitation({
        journal: submission.journal,
        submission: submission,
        submissionTitle: submission.node.title,
        referee: existingReferee,
        inviteToken: refereeInvite.token,
        dueDateHrs: refereeInvite.relativeDueDateHrs,
        editor,
      });
    }

    logger.info({ fn: 'inviteReferee', data, refereeInviteId: refereeInvite.id }, 'Invited referee');
    return ok(refereeInvite);
  } catch (error) {
    logger.error({ error, data }, 'Failed to invite referee');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred during referee invitation'));
  }
}

/**
 * Get all referee invites for a referee.
 */
export interface IRefereeInvite {
  submission: {
    journalId: number;
    journal: string;
    title: string;
    id: number;
    author: string;
    dpid: number;
  };
  id: number;
  submissionId: number;
  accepted: boolean;
  declined: boolean;
  expiresAt: Date;
  token: string;
}

async function getRefereeInvites(refereeUserId: number): Promise<Result<IRefereeInvite[], Error>> {
  try {
    const refereeInvites = await prisma.refereeInvite.findMany({
      where: {
        userId: refereeUserId,
      },
      select: {
        id: true,
        submissionId: true,
        accepted: true,
        declined: true,
        expiresAt: true,
        token: true,
        submission: {
          select: {
            id: true,
            dpid: true,
            node: {
              select: {
                title: true,
              },
            },
            author: {
              select: {
                name: true,
              },
            },
            journalId: true,
            journal: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    const invites = refereeInvites.map((invite) => ({
      ...invite,
      submission: {
        author: invite.submission.author.name,
        id: invite.submissionId,
        journalId: invite.submission.journalId,
        journal: invite.submission.journal.name,
        title: invite.submission.node.title,
        dpid: invite.submission.dpid,
      },
    }));
    return ok(invites);
  } catch (error) {
    logger.error({ error, refereeUserId }, 'Failed to get referee invites');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred during referee invite retrieval'),
    );
  }
}

export async function getRefereeInviteByToken(token: string): Promise<Result<RefereeInvite, Error>> {
  const refereeInvite = await prisma.refereeInvite.findUnique({
    where: { token },
  });

  return ok(refereeInvite);
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
export interface IRefereeAssignment {
  id: number;
  submissionId: number;
  userId: number;
  assignedById: number;
  assignedAt: Date;
  journalId: number;
  dueDate: Date;
  completedAssignment: boolean;
  completedAt: Date;
  reassignedAt: Date;
  journal: {
    id: number;
    name: string;
    iconCid: string;
    description: string;
  };
  submission: {
    id: number;
    title: string;
    status: string;
    author: {
      name: string;
      orcid: string;
    };
    dpid: number;
  };
  reviews: {
    id: number;
    recommendation: string;
    review: string;
    editorFeedback: string;
    authorFeedback: string;
  }[];
}
async function getRefereeAssignments(userId: number): Promise<Result<RefereeAssignment[], Error>> {
  try {
    const refereeAssignments = await prisma.refereeAssignment.findMany({
      where: {
        userId,
        // CompletedAssignment is only false if the referee drops out.
        OR: [{ completedAssignment: true }, { completedAssignment: null }],
      },
      select: {
        id: true,
        submissionId: true,
        userId: true,
        assignedById: true,
        assignedAt: true,
        journalId: true,
        dueDate: true,
        completedAssignment: true,
        completedAt: true,
        reassignedAt: true,
        expectedFormTemplateIds: true,
        journal: {
          select: {
            id: true,
            name: true,
            iconCid: true,
            description: true,
          },
        },
        submission: {
          select: {
            id: true,
            node: {
              select: {
                title: true,
              },
            },
            status: true,
            dpid: true,
            author: {
              select: {
                name: true,
                orcid: true,
              },
            },
          },
        },
        reviews: {
          select: {
            id: true,
            recommendation: true,
            review: true,
            editorFeedback: true,
            authorFeedback: true,
            submittedAt: true,
          },
        },
      },
    });
    const assignments = refereeAssignments.map((assignment) => ({
      ...assignment,
      submission: {
        id: assignment.submissionId,
        title: assignment.submission.node.title,
        status: assignment.submission.status,
        author: {
          name: assignment.submission.author.name,
          orcid: assignment.submission.author.orcid,
        },
        dpid: assignment.submission.dpid,
      },
      reviews: assignment.reviews.map((review) => ({
        ...review,
        review: JSON.parse(review.review as string),
      })),
    }));
    return ok(assignments);
  } catch (error) {
    logger.error({ error, refereeUserId: userId }, 'Failed to get active referee assignments');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred during referee assignment retrieval'),
    );
  }
}

async function isRefereeAssignedToSubmission(
  submissionId: number,
  refereeUserId: number,
  journalId: number,
): Promise<Result<boolean, Error>> {
  const refereeAssignment = await prisma.refereeAssignment.findFirst({
    where: { submissionId, journalId, userId: refereeUserId },
  });
  if (!refereeAssignment) {
    return ok(false);
  }
  return ok(true);
}

type AcceptRefereeInviteInput = {
  inviteToken: string;
  userId: number;
};

async function acceptRefereeInvite(data: AcceptRefereeInviteInput): Promise<Result<RefereeInvite, Error>> {
  try {
    // debugger;
    logger.trace({ fn: 'acceptRefereeInvite', data }, 'Accepting referee invite');
    const refereeInvite = await prisma.refereeInvite.findUnique({
      where: { token: data.inviteToken },
    });
    if (!refereeInvite) {
      return err(new Error('Referee invite not found'));
    }

    const alreadyAcceptedOrDeclined = refereeInvite.accepted === true || refereeInvite.declined === true;
    const inviteExpired = refereeInvite.expiresAt < new Date();
    const inviteIsValid = !alreadyAcceptedOrDeclined && !inviteExpired;
    if (!inviteIsValid) {
      return err(new Error('Referee invite not valid'));
    }

    const refereeUser = refereeInvite?.userId
      ? await prisma.user.findUnique({
          where: { id: refereeInvite.userId },
        })
      : refereeInvite.email
        ? await prisma.user.findUnique({
            where: { email: refereeInvite.email },
          })
        : null;
    if (!refereeUser) {
      return err(new Error('Referee not found'));
    }

    const submission = await prisma.journalSubmission.findUnique({
      where: { id: refereeInvite.submissionId },
      include: {
        journal: true,
        node: true,
        assignedEditor: true,
      },
    });
    const submissionExtendedResult = await journalSubmissionService.getSubmissionExtendedData(
      refereeInvite.submissionId,
    );
    if (submissionExtendedResult.isErr()) {
      return err(submissionExtendedResult.error);
    }
    const submissionExtended = submissionExtendedResult.value;

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
      expectedFormTemplateIds: refereeInvite.expectedFormTemplateIds,
    });

    try {
      if (submission.assignedEditorId) {
        const relativeDueDateHrs = refereeInvite.relativeDueDateHrs ?? DEFAULT_REVIEW_DUE_DATE_HRS;
        const dueDate = new Date(Date.now() + relativeDueDateHrs * 60 * 60 * 1000); // hours to ms conversion
        // Acceptance notif to editor
        await NotificationService.emitOnRefereeAcceptance({
          journal: submission.journal,
          submission: submission,
          submissionTitle: submission.node.title,
          referee: refereeUser,
          dueDate,
          refereeInvite: updatedRefereeInvite,
        });
        await sendEmail({
          type: EmailTypes.REFEREE_ACCEPTED,
          payload: {
            email: submission.assignedEditor.email,
            journal: submission.journal,
            refereeName: refereeUser.name,
            refereeEmail: refereeUser.email,
            submission: submissionExtended,
            reviewDeadline: dueDate.toISOString(),
          },
        });
        // TODO: Notify author of status change (Under review)
      }
    } catch (error) {
      logger.error({ fn: 'acceptRefereeInvite', data, error }, 'Notification push failed');
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
  expectedFormTemplateIds?: number[]; // Form templates the referee is expected to complete
};

export async function assignReferee(data: AssignRefereeInput): Promise<Result<RefereeAssignment, Error>> {
  try {
    logger.trace({ fn: 'assignReferee', data }, 'Assigning referee');
    const submission = await prisma.journalSubmission.findUnique({
      where: { id: data.submissionId },
      include: {
        journal: true,
        node: true,
        assignedEditor: true,
      },
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
          userId: data.refereeUserId,
          assignedById: data.managerId,
          assignedAt: new Date(),
          ...(data.isReassignment ? { reassignedAt: new Date() } : {}), // Indicate if its a reassignment
          dueDate,
          journalId: data.journalId,
          expectedFormTemplateIds: data.expectedFormTemplateIds || [],
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
            assignedEditor: true,
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

    const refereeEmail = refereeUser?.email ?? refereeInvite.email;

    const submission = refereeInvite.submission;

    const submissionExtendedResult = await journalSubmissionService.getSubmissionExtendedData(
      refereeInvite.submissionId,
    );
    if (submissionExtendedResult.isErr()) {
      return err(submissionExtendedResult.error);
    }
    const submissionExtended = submissionExtendedResult.value;

    const alreadyAcceptedOrDeclined = refereeInvite.accepted === true || refereeInvite.declined === true;
    const inviteExpired = refereeInvite.expiresAt < new Date();
    const inviteIsValid = !alreadyAcceptedOrDeclined && !inviteExpired;
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

    try {
      if (submission.assignedEditorId) {
        // Emit notif to inform editor that referee declined
        await NotificationService.emitOnRefereeDecline({
          journal: submission.journal,
          submission: submission,
          submissionTitle: submission.node.title,
          referee: refereeUser,
          refereeInvite,
        });
      }

      const refereeName = refereeUser?.name ?? 'A Referee';
      await sendEmail({
        type: EmailTypes.REFEREE_DECLINED,
        payload: {
          email: submission.assignedEditor.email,
          journal: submission.journal,
          refereeName: refereeName,
          refereeEmail: refereeEmail,
          submission: submissionExtended,
          declineReason: 'N/A', // Add this in the future.
          suggestedReferees: [], // Add this in the future.
        },
      });
    } catch (error) {
      logger.error({ fn: 'declineRefereeInvite', data, error }, 'Notification push failed');
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
export async function invalidateRefereeAssignment(
  assignmentId: number,
  userId: number,
): Promise<Result<RefereeAssignment, Error>> {
  try {
    logger.trace({ fn: 'invalidateRefereeAssignment', assignmentId }, 'Attempting to invalidate referee assignment');

    const refereeAssignment = await prisma.refereeAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        submission: {
          include: {
            journal: true,
          },
        },
      },
    });
    if (!refereeAssignment) {
      return err(new Error('Referee assignment not found'));
    }

    if (!userId) {
      // Should never happen, but its a hard-stop.
      // To prevent querying on undefined userId
      logger.error({ fn: 'invalidateRefereeAssignment', userId, assignmentId }, 'User ID is required');
      return err(new Error('User ID is required'));
    }

    // Figure out auth method.
    // 1. User is the referee
    // 2. User is the editor for that submission
    // 3. User is the chief editor of that journal

    let authMethod: 'referee' | 'editor' | 'chiefEditor' | null = null;

    const isUserReferee = refereeAssignment.userId === userId;
    if (isUserReferee) {
      authMethod = 'referee';
    } else if (refereeAssignment.submission.assignedEditorId === userId) {
      authMethod = 'editor';
    } else {
      const chiefEditorRecord = await prisma.journalEditor.findFirst({
        where: {
          userId,
          journalId: refereeAssignment.journalId,
          role: EditorRole.CHIEF_EDITOR,
        },
      });
      if (chiefEditorRecord) {
        authMethod = 'chiefEditor';
      }
    }

    if (!authMethod) {
      logger.warn(
        { fn: 'invalidateRefereeAssignment', userId, assignmentId },
        'Unauthorized to invalidate referee assignment',
      );
      return err(new Error('Unauthorized'));
    }

    const updatedRefereeAssignment = await prisma.$transaction(async (tx) => {
      const assignment = await tx.refereeAssignment.update({
        where: { id: assignmentId },
        data: { completedAssignment: false },
      });

      await tx.journalEventLog.create({
        data: {
          journalId: assignment.journalId,
          action: JournalEventLogAction.REFEREE_ASSIGNMENT_DROPPED,
          userId: refereeAssignment.userId,
          details: {
            submissionId: assignment.submissionId,
            refereeId: assignment.userId,
            assignedEditorId: assignment.assignedById,
            triggeredByUserId: userId,
            authMethod,
          },
        },
      });
      return assignment;
    });
    logger.info(
      { fn: 'invalidateRefereeAssignment', assignmentId, authMethod, userId },
      'Invalidated referee assignment',
    );

    return ok(updatedRefereeAssignment);
  } catch (error) {
    logger.error({ error, assignmentId }, 'Failed to invalidate referee assignment');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred during referee assignment invalidation'),
    );
  }
}

export const JournalRefereeManagementService = {
  assignReferee,
  inviteReferee,
  getRefereeInvites,
  acceptRefereeInvite,
  declineRefereeInvite,
  getRefereeAssignments,
  isRefereeAssignedToSubmission,
  invalidateRefereeAssignment,
  getRefereeInviteByToken,
};
