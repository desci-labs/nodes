import { EditorRole, JournalEventLogAction, SubmissionStatus } from '@prisma/client';
import { Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import {
  createReviewSchema,
  getReviewsByAssignmentSchema,
  updateReviewSchema,
} from '../../../schemas/journals.schema.js';
import { JournalEventLogService } from '../../../services/journals/JournalEventLogService.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';
import { JournalRefereeManagementService } from '../../../services/journals/JournalRefereeManagementService.js';
import {
  checkRefereeSubmissionReview,
  getAllRefereeReviewsBySubmission,
  getAuthorSubmissionReviews,
  getJournalReviewById,
  getReviewsByAssignment,
  getSubmissionReviews,
  saveReview,
  submitReview,
} from '../../../services/journals/JournalReviewService.js';
import { journalSubmissionService } from '../../../services/journals/JournalSubmissionService.js';

const logger = parentLogger.child({
  module: 'Journals::ReviewsController',
});

type CreateReviewRequest = ValidatedRequest<typeof createReviewSchema, AuthenticatedRequest>;

export const createReviewController = async (req: CreateReviewRequest, res: Response) => {
  const { journalId, submissionId } = req.validatedData.params;
  const { review, recommendation, editorFeedback, authorFeedback } = req.validatedData.body;

  const journal = await JournalManagementService.getJournalById(journalId);

  if (journal._unsafeUnwrap() === null) {
    return sendError(res, 'Journal not found', 404);
  }

  const submission = await journalSubmissionService.getSubmissionById(submissionId);
  if (submission.isErr()) {
    return sendError(res, submission.error, 400);
  }

  if (submission.value.status !== SubmissionStatus.UNDER_REVIEW) {
    return sendError(res, 'Submission is not in under review status', 400);
  }

  const refereeUserId = req.user.id;

  const isRefereeAssigned = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
    submissionId,
    refereeUserId,
    journalId,
  );

  if (isRefereeAssigned.isOk() && isRefereeAssigned.value === false) {
    return sendError(res, 'User is not an assigned referee to this submission', 403);
  }

  const existingReview = await checkRefereeSubmissionReview({
    journalId,
    submissionId,
    refereeUserId,
  });

  if (existingReview.isOk() && existingReview.value !== null) {
    return sendError(res, 'Review already exists', 403);
  }

  const result = await saveReview({
    journalId,
    submissionId,
    refereeUserId,
    update: {
      recommendation,
      editorFeedback,
      authorFeedback,
      // review: review ? JSON.stringify(review) : undefined,
    },
  });

  if (result.isErr()) {
    return sendError(res, result.error, 400);
  }

  const newReview = result._unsafeUnwrap();

  await JournalEventLogService.log({
    journalId,
    action: JournalEventLogAction.REVIEW_CREATED,
    userId: req.user.id,
    submissionId,
    details: {
      reviewId: newReview.id,
    },
  });

  const data = _.pick(newReview, [
    'id',
    'recommendation',
    'editorFeedback',
    'authorFeedback',
    'review',
    'submissionId',
    'refereeAssignmentId',
    'journalId',
    'submittedAt',
  ]);

  // data.review = data.review ? JSON.parse(data.review as string) : null;

  return sendSuccess(res, data);
};

type UpdateReviewRequest = ValidatedRequest<typeof updateReviewSchema, AuthenticatedRequest>;

export const updateReviewController = async (req: UpdateReviewRequest, res: Response) => {
  const { journalId, submissionId, reviewId } = req.validatedData.params;
  const { review, recommendation, editorFeedback, authorFeedback } = req.validatedData.body;

  const journal = await JournalManagementService.getJournalById(journalId);

  if (journal._unsafeUnwrap() === null) {
    return sendError(res, 'Journal not found', 404);
  }

  const submission = await journalSubmissionService.getSubmissionById(submissionId);
  if (submission.isErr()) {
    return sendError(res, submission.error, 400);
  }

  if (submission._unsafeUnwrap().status !== SubmissionStatus.UNDER_REVIEW) {
    return sendError(res, 'Submission is not in under review status', 400);
  }

  const refereeUserId = req.user.id;

  const isRefereeAssigned = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
    submissionId,
    refereeUserId,
    journalId,
  );

  if (isRefereeAssigned._unsafeUnwrap() !== true) {
    return sendError(res, 'User is not an assigned referee to this submission', 403);
  }

  const updatedReview = await saveReview({
    reviewId,
    journalId,
    submissionId,
    refereeUserId,
    update: {
      recommendation,
      editorFeedback,
      authorFeedback,
      // review: review ? JSON.stringify(review) : undefined,
    },
  });

  if (updatedReview.isErr()) {
    return sendError(res, updatedReview.error, 400);
  }

  await JournalEventLogService.log({
    journalId,
    action: JournalEventLogAction.REVIEW_UPDATED,
    userId: req.user.id,
    submissionId,
    details: {
      reviewId,
    },
  });

  const data = _.pick(updatedReview._unsafeUnwrap(), [
    'id',
    'recommendation',
    'editorFeedback',
    'authorFeedback',
    'review',
    'submissionId',
    'refereeAssignmentId',
    'journalId',
    'submittedAt',
  ]);
  // data.review = data.review ? JSON.parse(data.review as string) : null;
  return sendSuccess(res, data);
};

type SubmitReviewRequest = ValidatedRequest<typeof updateReviewSchema, AuthenticatedRequest>;

export const submitReviewController = async (req: SubmitReviewRequest, res: Response) => {
  const { journalId, submissionId, reviewId } = req.validatedData.params;
  const { review, recommendation, editorFeedback, authorFeedback } = req.validatedData.body;

  const journal = await JournalManagementService.getJournalById(journalId);

  if (journal._unsafeUnwrap() === null) {
    return sendError(res, 'Journal not found', 404);
  }

  const submission = await journalSubmissionService.getSubmissionById(submissionId);
  if (submission.isErr()) {
    return sendError(res, submission.error, 400);
  }

  if (submission._unsafeUnwrap().status !== SubmissionStatus.UNDER_REVIEW) {
    return sendError(res, 'Submission is not in under review status', 400);
  }

  const refereeId = req.user.id;

  const isRefereeAssigned = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
    submissionId,
    refereeId,
    journalId,
  );

  if (isRefereeAssigned._unsafeUnwrap() !== true) {
    return sendError(res, 'User is not an assigned referee to this submission', 403);
  }

  const updatedReview = await submitReview({
    reviewId,
    update: {
      recommendation,
      editorFeedback,
      authorFeedback,
      // review: JSON.stringify(review),
    },
  });

  if (updatedReview.isErr()) {
    return sendError(res, updatedReview.error, 400);
  }

  await JournalEventLogService.log({
    journalId,
    action: JournalEventLogAction.REVIEW_SUBMITTED,
    userId: req.user.id,
    submissionId,
    details: {
      reviewId,
    },
  });

  // TODO: Send email to editor and author

  const data = _.pick(updatedReview._unsafeUnwrap(), [
    'id',
    'recommendation',
    'editorFeedback',
    'authorFeedback',
    'review',
    'submittedAt',
  ]);
  // data.review = data.review ? JSON.parse(data.review as string) : null;
  return sendSuccess(res, data);
};

type GetSubmissionReviewsRequest = ValidatedRequest<typeof createReviewSchema, AuthenticatedRequest>;
export const getSubmissionReviewsController = async (req: GetSubmissionReviewsRequest, res: Response) => {
  const { journalId, submissionId } = req.validatedData.params;

  const userId = req.user.id;
  const userRoleInJournal = await JournalManagementService.getUserJournalRole(journalId, userId);
  const isEditor =
    userRoleInJournal.isOk() &&
    [EditorRole.CHIEF_EDITOR, EditorRole.ASSOCIATE_EDITOR].includes(userRoleInJournal.value);

  if (isEditor) {
    const reviews = await getSubmissionReviews({ submissionId });
    return sendSuccess(res, reviews);
  }

  const isReferee = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
    submissionId,
    userId,
    journalId,
  );
  if (isReferee.isOk() && isReferee.value === true) {
    const reviews = await getAllRefereeReviewsBySubmission({ submissionId, userId });
    return sendSuccess(res, reviews.isOk() ? reviews.value : []);
  }

  const reviews = await getAuthorSubmissionReviews({ submissionId, authorId: userId });

  return sendSuccess(res, reviews.isOk() ? reviews.value : []);
};

type GetReviewByIdRequest = ValidatedRequest<typeof updateReviewSchema, AuthenticatedRequest>;
export const getReviewByIdController = async (req: GetReviewByIdRequest, res: Response) => {
  const { journalId, submissionId, reviewId } = req.validatedData.params;

  const userId = req.user.id;
  const userRoleInJournal = await JournalManagementService.getUserJournalRole(journalId, userId);
  const isEditor =
    userRoleInJournal.isOk() &&
    [EditorRole.CHIEF_EDITOR, EditorRole.ASSOCIATE_EDITOR].includes(userRoleInJournal.value);

  if (isEditor) {
    const review = await getJournalReviewById({ journalId, reviewId });
    return sendSuccess(res, review.isOk() ? review.value : null);
  }

  const isReferee = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
    submissionId,
    userId,
    journalId,
  );
  if (isReferee.isOk() && isReferee.value === true) {
    const result = await getJournalReviewById({ journalId, reviewId });
    if (result.isErr()) {
      return sendError(res, result.error, 400);
    }

    return sendSuccess(res, result.isOk() ? result.value : null);
  }

  const isAuthor = await journalSubmissionService.isSubmissionByAuthor(submissionId, userId);
  if (isAuthor.isOk()) {
    const result = await getJournalReviewById({ journalId, reviewId, completed: true });

    if (result.isErr()) {
      return sendError(res, result.error, 400);
    }

    const review = result.isOk() ? result.value : null;
    if (!review) {
      return sendSuccess(res, null);
    }

    if (
      review.submission.status === SubmissionStatus.UNDER_REVIEW ||
      review.submission.status === SubmissionStatus.SUBMITTED
    ) {
      return sendSuccess(res, null);
    }
    return sendSuccess(res, review);
  }

  return sendSuccess(res, null);
};

type GetReviewsByAssignmentRequest = ValidatedRequest<typeof getReviewsByAssignmentSchema, AuthenticatedRequest>;
export const getReviewsByAssignmentController = async (req: GetReviewsByAssignmentRequest, res: Response) => {
  const { assignmentId } = req.validatedData.params;
  const { limit, offset } = req.validatedData.query;

  const userId = req.user.id;

  const result = await getReviewsByAssignment({
    assignmentId,
    userId,
    limit,
    offset,
  });

  if (result.isErr()) {
    return sendError(res, result.error, 403);
  }

  const { reviews, assignment } = result.value;

  const response = {
    reviews: reviews.map((review) => ({
      id: review.id,
      recommendation: review.recommendation,
      editorFeedback: review.editorFeedback,
      authorFeedback: review.authorFeedback,
      review: review.review,
      submittedAt: review.submittedAt,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      formResponse: review.formResponse
        ? {
            id: review.formResponse.id,
            templateId: review.formResponse.templateId,
            status: review.formResponse.status,
            formData: review.formResponse.formData,
            startedAt: review.formResponse.startedAt,
            submittedAt: review.formResponse.submittedAt,
            updatedAt: review.formResponse.updatedAt,
            template: review.formResponse.template
              ? {
                  id: review.formResponse.template.id,
                  name: review.formResponse.template.name,
                  description: review.formResponse.template.description,
                  version: review.formResponse.template.version,
                  structure: review.formResponse.template.structure,
                }
              : null,
          }
        : null,
    })),
    assignment: {
      id: assignment.id,
      submissionId: assignment.submissionId,
      journalId: assignment.journalId,
      assignedAt: assignment.assignedAt,
      dueDate: assignment.dueDate,
      completedAt: assignment.completedAt,
      submission: {
        id: assignment.submission.id,
        title: assignment.submission.node.title,
        status: assignment.submission.status,
        author: assignment.submission.author,
      },
      journal: assignment.journal,
    },
  };

  return sendSuccess(res, response);
};
