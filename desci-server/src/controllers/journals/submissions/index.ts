import { DriveObject } from '@desci-labs/desci-models';
import { EditorRole, JournalEventLogAction, JournalSubmission, Prisma, SubmissionStatus } from '@prisma/client';
import { isAfter, isBefore } from 'date-fns';
import { Response } from 'express';

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
  requestRevisionSchema,
  submissionApiSchema,
  rejectSubmissionSchema,
  reviewsApiSchema,
  submissionStatusCountSchema,
} from '../../../schemas/journals.schema.js';
import { EmailTypes, sendEmail } from '../../../services/email/email.js';
import { FileTreeService } from '../../../services/FileTreeService.js';
import { getTargetDpidUrl } from '../../../services/fixDpid.js';
import { doiService } from '../../../services/index.js';
import { JournalEventLogService } from '../../../services/journals/JournalEventLogService.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';
import { getRefereeInvitationsBySubmission } from '../../../services/journals/JournalReviewService.js';
import { journalSubmissionService } from '../../../services/journals/JournalSubmissionService.js';
import { getLastPublishDate, getNodeByDpid } from '../../../services/node.js';
import { getPublishedNodeVersionCount } from '../../../services/nodeManager.js';
import { NotificationService } from '../../../services/Notifications/NotificationService.js';
import { DiscordChannel, DiscordNotifyType } from '../../../utils/discordUtils.js';
import { discordNotify } from '../../../utils/discordUtils.js';
import { asyncMap } from '../../../utils.js';

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

const statusMap: Record<string, SubmissionStatus[]> = {
  new: [SubmissionStatus.SUBMITTED],
  assigned: [SubmissionStatus.SUBMITTED],
  under_review: [SubmissionStatus.UNDER_REVIEW],
  reviewed: [SubmissionStatus.ACCEPTED, SubmissionStatus.REJECTED],
  under_revision: [SubmissionStatus.REVISION_REQUESTED],
} as const;

export const listJournalSubmissionsController = async (req: ListJournalSubmissionsRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;
    const { limit, offset, status, startDate, endDate, assignedToMe, sortBy, sortOrder } = req.validatedData.query;

    const editor = await JournalManagementService.getUserJournalRole(journalId, req.user.id);
    const role = editor.isOk() ? editor.value : undefined;
    let submissions: Awaited<ReturnType<typeof journalSubmissionService.getJournalSubmissions>>;

    const filter: Prisma.JournalSubmissionWhereInput = {
      journalId,
    };

    if (status) {
      filter.status = { in: statusMap[status] };

      if (status === 'new') {
        filter.assignedEditorId = null;
      }

      if (status === 'assigned') {
        filter.status = SubmissionStatus.SUBMITTED;
        filter.assignedEditorId = { not: null };
      }
    }

    if (assignedToMe) {
      filter.assignedEditorId = req.user.id;
    }

    if (startDate) {
      filter.submittedAt = { gte: startDate };

      if (endDate) {
        filter.submittedAt = { lte: endDate };
      }
    }

    let orderBy: Prisma.JournalSubmissionOrderByWithRelationInput;
    if (sortBy) {
      if (sortBy === 'date') {
        orderBy = {
          submittedAt: sortOrder,
        };
      } else if (sortBy === 'title') {
        orderBy = {
          node: {
            title: sortOrder,
          },
        };
      }
    }

    logger.trace({ filter, payload: req.validatedData }, 'listJournalSubmissionsController::filter');

    if (role === EditorRole.CHIEF_EDITOR) {
      submissions = await journalSubmissionService.getJournalSubmissions(journalId, filter, orderBy, offset, limit);
    } else if (role === EditorRole.ASSOCIATE_EDITOR) {
      const assignedEditorId = req.user.id;
      submissions = await journalSubmissionService.getJournalSubmissions(
        journalId,
        {
          ...filter,
          assignedEditorId,
        },
        orderBy,
        offset,
        limit,
      );
    } else {
      submissions = await journalSubmissionService.getJournalSubmissions(
        journalId,
        {
          status: SubmissionStatus.ACCEPTED,
        },
        orderBy,
        offset,
        limit,
      );
    }

    // getLastPublishDate
    const data: Partial<JournalSubmission>[] = await asyncMap(submissions, async (submission) => {
      const publishedAt = await getLastPublishDate(submission.node.uuid ?? '');
      return {
        ...submission,
        publishedAt,
        assignedEditor: submission.assignedEditor?.name,
        reviews: submission.refereeAssignments
          .filter((review) => review.completedAssignment)
          .map((review) => ({
            completed: review.completedAssignment,
            completedAt: review.completedAt,
            referee: review.referee?.name,
            dueDate: review.dueDate,
          })),
        refereeInvites:
          role === EditorRole.CHIEF_EDITOR || role === EditorRole.ASSOCIATE_EDITOR
            ? submission.RefereeInvite.filter(
                (invite) => isBefore(new Date(), invite.expiresAt) && !invite.accepted && !invite.declined,
              ).map((invite) => ({
                id: invite.id,
                email: invite.email,
                accepted: invite.accepted,
                acceptedAt: invite.acceptedAt,
                declined: invite.declined,
                declinedAt: invite.declinedAt,
                expiresAt: invite.expiresAt,
                invitedAt: invite.createdAt,
              }))
            : [],
        RefereeInvite: void 0,
        refereeAssignments: void 0,
        title: submission.node.title,
        node: undefined,
      };
    });
    logger.trace({ data }, 'listJournalSubmissionsController');
    return sendSuccess(res, { data, meta: { count: submissions.length, limit, offset } });
  } catch (error) {
    logger.error({ error });
    return sendError(res, 'Failed to retrieve journal submissions', 500);
  }
};

type ListJournalSubmissionsByStatusCountRequest = ValidatedRequest<
  typeof submissionStatusCountSchema,
  AuthenticatedRequest
>;
export const getJournalSubmissionsByStatusCountController = async (
  req: ListJournalSubmissionsByStatusCountRequest,
  res: Response,
) => {
  try {
    const { journalId } = req.validatedData.params;
    const { startDate, endDate, assignedToMe } = req.validatedData.query;

    const editor = await JournalManagementService.getUserJournalRole(journalId, req.user.id);
    const role = editor.isOk() ? editor.value : undefined;
    let submissions;

    const filter: Prisma.JournalSubmissionWhereInput = {
      journalId,
    };

    if (assignedToMe) {
      filter.assignedEditorId = req.user.id;
    }

    if (startDate || endDate) {
      filter.submittedAt = { ...(startDate && { gte: startDate }), ...(endDate && { lte: endDate }) };
    }

    // logger.error({ filter, assignedToMe, role }, 'StatusCount::filter');

    if (role === EditorRole.CHIEF_EDITOR) {
      const newSubmissions = await journalSubmissionService.getJournalSubmissionsCount(journalId, {
        ...filter,
        status: SubmissionStatus.SUBMITTED,
        ...(assignedToMe ? { assignedEditorId: req.user.id } : { assignedEditorId: null }),
      });
      const assignedSubmissions = await journalSubmissionService.getJournalSubmissionsCount(journalId, {
        ...filter,
        status: SubmissionStatus.SUBMITTED,
        ...(assignedToMe ? { assignedEditorId: req.user.id } : { assignedEditorId: { not: null } }),
      });
      const inReviewSubmissions = await journalSubmissionService.getJournalSubmissionsCount(journalId, {
        ...filter,
        status: SubmissionStatus.UNDER_REVIEW,
      });
      const underRevisionSubmissions = await journalSubmissionService.getJournalSubmissionsCount(journalId, {
        ...filter,
        status: SubmissionStatus.REVISION_REQUESTED,
      });
      const reviewedSubmissions = await journalSubmissionService.getJournalSubmissionsCount(journalId, {
        ...filter,
        status: { in: [SubmissionStatus.REJECTED, SubmissionStatus.ACCEPTED] },
      });
      const publishedSubmissions = await journalSubmissionService.getJournalSubmissionsCount(journalId, {
        ...filter,
        status: SubmissionStatus.ACCEPTED,
      });

      submissions = {
        new: newSubmissions,
        assigned: assignedSubmissions,
        inReview: inReviewSubmissions,
        underRevision: underRevisionSubmissions,
        reviewed: reviewedSubmissions,
        published: publishedSubmissions,
      };
    } else if (role === EditorRole.ASSOCIATE_EDITOR) {
      const assignedEditorId = req.user.id;
      const newSubmissions = await journalSubmissionService.getJournalSubmissionsCount(journalId, {
        ...filter,
        status: SubmissionStatus.SUBMITTED,
        assignedEditorId,
      });
      const inReviewSubmissions = await journalSubmissionService.getJournalSubmissionsCount(journalId, {
        ...filter,
        status: SubmissionStatus.UNDER_REVIEW,
        assignedEditorId,
      });
      const underRevisionSubmissions = await journalSubmissionService.getJournalSubmissionsCount(journalId, {
        ...filter,
        status: SubmissionStatus.REVISION_REQUESTED,
        assignedEditorId,
      });
      const reviewedSubmissions = await journalSubmissionService.getJournalSubmissionsCount(journalId, {
        ...filter,
        status: { in: [SubmissionStatus.REJECTED, SubmissionStatus.ACCEPTED] },
        assignedEditorId,
      });
      const publishedSubmissions = await journalSubmissionService.getJournalSubmissionsCount(journalId, {
        ...filter,
        status: SubmissionStatus.ACCEPTED,
        assignedEditorId,
      });

      submissions = {
        new: newSubmissions,
        assigned: 0,
        inReview: inReviewSubmissions,
        underRevision: underRevisionSubmissions,
        reviewed: reviewedSubmissions,
        published: publishedSubmissions,
      };
    } else {
      // For non-editors, only show accepted submissions count
      const acceptedSubmissions = await journalSubmissionService.getJournalSubmissionsCount(journalId, {
        ...filter,
        status: SubmissionStatus.ACCEPTED,
      });

      submissions = {
        new: 0,
        assigned: 0,
        inReview: 0,
        underRevision: 0,
        reviewed: acceptedSubmissions,
      };
    }

    // logger.error({ assignedToMe, filter, role, submissions }, 'listJournalSubmissionsByStatusCountController');
    return sendSuccess(res, submissions);
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

    const data = await journalSubmissionService.getAuthorSubmissions({
      journalId,
      authorId,
      limit,
      offset,
    });

    return sendSuccess(res, { data, meta: { count: data.length, limit, offset } });
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

    const submission = await journalSubmissionService.assignSubmissionToEditor({
      journalId,
      assignerId,
      submissionId,
      editorId,
    });

    return sendSuccess(res, submission);
  } catch (error) {
    logger.error({ error });
    return sendError(res, 'Failed to assign submission to editor', 500);
  }
};

type RequestRevisionRequest = ValidatedRequest<typeof requestRevisionSchema, AuthenticatedRequest>;

export const requestRevisionController = async (req: RequestRevisionRequest, res: Response) => {
  const { journalId, submissionId } = req.validatedData.params;
  const { comment, revisionType } = req.validatedData.body;

  // check if journal and submission are valid.
  await journalSubmissionService.requestRevision({
    submissionId,
    editorId: req.user.id,
    revisionType,
    comment,
  });

  // LOG the event
  await JournalEventLogService.log({
    journalId,
    action: JournalEventLogAction.REVISION_REQUESTED,
    userId: req.user.id,
    submissionId,
    details: {
      comment,
      revisionType,
    },
  });
  // TODO: notify the referee of the editor decision.

  return sendSuccess(res, null);
};

type AcceptSubmissionRequest = ValidatedRequest<typeof submissionApiSchema, AuthenticatedRequest>;
export const acceptSubmissionController = async (req: AcceptSubmissionRequest, res: Response) => {
  const { journalId, submissionId } = req.validatedData.params;

  // check if journal and submission are valid.
  const submission = await journalSubmissionService.acceptSubmission({ submissionId, editorId: req.user.id });

  // LOG the event
  await JournalEventLogService.log({
    journalId,
    action: JournalEventLogAction.SUBMISSION_ACCEPTED,
    userId: req.user.id,
    submissionId,
  });

  try {
    const isFirstDoi = await doiService.isFirstDoi(submission.dpid.toString());
    if (isFirstDoi) {
      const node = await getNodeByDpid(submission.dpid);
      const doiSubmission = await doiService.autoMintTrigger(node.uuid);
      const targetDpidUrl = getTargetDpidUrl();
      discordNotify({
        channel: DiscordChannel.DoiMinting,
        type: DiscordNotifyType.INFO,
        title: 'Mint DOI',
        message: `${targetDpidUrl}/${submission.dpid} sent a request to mint: ${doiSubmission.uniqueDoi}`,
      });

      // update submissioin with doi
      await journalSubmissionService.updateSubmissionDoi(submissionId, doiSubmission.uniqueDoi);

      await JournalEventLogService.log({
        journalId,
        action: JournalEventLogAction.SUBMISSION_DOI_REQUESTED,
        userId: req.user.id,
        submissionId,
        details: {
          doi: doiSubmission.uniqueDoi,
        },
      });
    }
  } catch (error) {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    logger.error(
      { error: error.message, reqUser: req?.user?.id, user: user?.id },
      'JOURNAL_SUBMISSION::ACCEPT_SUBMISSION::Failed to mint DOI',
    );
    // console.log('JOURNAL_SUBMISSION::ACCEPT_SUBMISSION::Failed to mint DOI', {
    //   error: error.message,
    //   reqUser: req.user,
    //   user,
    // });
    // TODO: log error to sentry or private discord channel
    await JournalEventLogService.log({
      journalId,
      action: JournalEventLogAction.SUBMISSION_DOI_MINTING_FAILED,
      userId: req.user.id,
      submissionId,
      details: {
        error: error.message,
      },
    });
  }

  // TODO: notify the author that the revision is requested.
  // TODO: notify the referee of the editor decision.

  return sendSuccess(res, null);
};

type RejectSubmissionRequest = ValidatedRequest<typeof rejectSubmissionSchema, AuthenticatedRequest>;
export const rejectSubmissionController = async (req: RejectSubmissionRequest, res: Response) => {
  const { journalId, submissionId } = req.validatedData.params;
  const { comment } = req.validatedData.body;

  // check if journal and submission are valid.
  const rejectedSubmission = await journalSubmissionService.rejectSubmission({ submissionId, editorId: req.user.id });

  // LOG the event
  await JournalEventLogService.log({
    journalId,
    action: JournalEventLogAction.SUBMISSION_REJECTED,
    userId: req.user.id,
    submissionId,
    details: {
      comment,
    },
  });

  try {
    // Notification logic
    const submission = rejectedSubmission;

    const assignedEditor = await prisma.journalEditor.findUnique({
      where: { userId_journalId: { userId: submission.assignedEditorId, journalId: submission.journalId } },
      include: {
        user: true,
      },
    });

    const submissionExtendedResult = await journalSubmissionService.getSubmissionExtendedData(submissionId);
    if (submissionExtendedResult.isErr()) {
      throw new Error('Failed to get submission extended data');
    }
    const submissionExtended = submissionExtendedResult.value;

    const isDeskRejectionResult = await journalSubmissionService.isSubmissionDeskRejection(submissionId);
    if (isDeskRejectionResult.isErr()) {
      throw new Error('Failed to check if the submission is desk rejected');
    }
    const isDeskRejection = isDeskRejectionResult.value;

    const notifPayload = {
      journal: submission.journal,
      editor: assignedEditor,
      submission: submission,
      submissionTitle: submissionExtended.title,
      author: submission.author,
    };
    const emailPayload = {
      email: submission.author.email,
      journal: submission.journal,
      editor: {
        name: assignedEditor.user.name,
        userId: assignedEditor.userId,
      },
      comments: comment,
      submission: submissionExtended,
    };

    if (isDeskRejection) {
      // Desk Rejection
      await NotificationService.emitOnSubmissionDeskRejection(notifPayload);
    } else {
      // Final Rejection
      await NotificationService.emitOnSubmissionFinalRejection(notifPayload);
    }
    await sendEmail({
      type: isDeskRejection ? EmailTypes.SUBMISSION_DESK_REJECTED : EmailTypes.SUBMISSION_FINAL_REJECTED,
      payload: emailPayload,
    });
  } catch (e) {
    logger.error({ fn: 'acceptSubmission', error: e, submissionId }, 'Notification push failed');
  }
  // TODO: notify the referee of the editor decision.

  return sendSuccess(res, null);
};

type GetJournalSubmissionRequest = ValidatedRequest<typeof submissionApiSchema, AuthenticatedRequest>;

export const getJournalSubmissionController = async (req: GetJournalSubmissionRequest, res: Response) => {
  const { journalId, submissionId } = req.validatedData.params;
  const { includeTree, filterHiddenFiles } = req.validatedData.query;

  const submissionExtended = await journalSubmissionService.getSubmissionDetails(submissionId);
  if (submissionExtended.isErr()) {
    return sendError(res, 'Failed to get submission extended data', 500);
  }
  const submission = submissionExtended.value;
  if (submission.journal.id !== journalId) {
    return sendError(res, 'Submission not found', 404);
  }

  const { manifestCid, uuid } = submission.researchObject;

  let tree;
  if (includeTree) {
    const treeResult = await FileTreeService.getPublishedTree({
      manifestCid,
      uuid,
      filterHiddenFiles, // Filter out .nodeKeep and .DS_Store files
    });
    if (treeResult.isOk()) {
      tree = treeResult.value.tree;
    }
  }

  return sendSuccess(res, { ...submission, ...(includeTree ? { tree } : {}) });
};

type GetRefereeInvitationsBySubmissionRequest = ValidatedRequest<typeof reviewsApiSchema, AuthenticatedRequest>;

export const getRefereeInvitationsBySubmissionController = async (
  req: GetRefereeInvitationsBySubmissionRequest,
  res: Response,
) => {
  const { journalId, submissionId } = req.validatedData.params;

  const journal = await JournalManagementService.getJournalById(journalId);
  if (journal.isErr()) {
    return sendError(res, 'Journal not found', 404);
  }

  const submission = await journalSubmissionService.getSubmissionById(submissionId);
  if (submission.isErr()) {
    return sendError(res, submission.error, 400);
  }

  if (submission.value.journalId !== journalId) {
    return sendError(res, 'Submission does not belong to this journal', 403);
  }

  const isEditor = await JournalManagementService.getUserJournalRole(journalId, req.user.id);
  if (
    isEditor.isOk() &&
    isEditor.value === EditorRole.ASSOCIATE_EDITOR &&
    submission.value.assignedEditorId !== req.user.id
  ) {
    return sendError(res, 'User is not the assigned editor for this submission', 403);
  }

  const result = await getRefereeInvitationsBySubmission({ submissionId });

  if (result.isErr()) {
    return sendError(res, result.error.message, 403);
  }

  return sendSuccess(res, result.value);
};
