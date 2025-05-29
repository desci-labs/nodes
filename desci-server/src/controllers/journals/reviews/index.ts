import { EditorRole, JournalEventLogAction, JournalSubmission, SubmissionStatus } from '@prisma/client';
import { NextFunction, Response } from 'express';
import _ from 'lodash';

import { prisma } from '../../../client.js';
import { sendError, sendSuccess } from '../../../core/api.js';
import { ForbiddenError } from '../../../core/ApiError.js';
import { AuthenticatedRequest, OptionalAuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { createReviewSchema, updateReviewSchema } from '../../../schemas/journals.schema.js';
import { JournalEventLogService } from '../../../services/journals/JournalEventLogService.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';
import { JournalRefereeManagementService } from '../../../services/journals/JournalRefereeManagementService.js';
import {
  checkRefereeSubmissionReview,
  getAllRefereeReviewsBySubmission,
  getAuthorSubmissionReviews,
  getJournalReviewById,
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

  // TODO: check referee management controller to make sure submission is update to under review status
  // when referee is assigned to submission
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
    return sendError(res, 'Referee not assigned to submission', 400);
  }

  const existingReview = await checkRefereeSubmissionReview({
    journalId,
    submissionId,
    refereeId,
  });

  if (existingReview._unsafeUnwrap() !== null) {
    return sendError(res, 'Review already exists', 400);
  }

  const newReview = await saveReview({
    journalId,
    submissionId,
    refereeId,
    update: {
      recommendation,
      editorFeedback,
      authorFeedback,
      review,
    },
  });

  await JournalEventLogService.log({
    journalId,
    action: JournalEventLogAction.REVIEW_CREATED,
    userId: req.user.id,
    submissionId,
    details: {
      reviewId: newReview._unsafeUnwrap().id,
    },
  });

  // TODO: Send email to editor and author

  const data = _.pick(newReview._unsafeUnwrap(), [
    'id',
    'recommendation',
    'editorFeedback',
    'authorFeedback',
    'review',
  ]);
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

  const refereeId = req.user.id;

  const isRefereeAssigned = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
    submissionId,
    refereeId,
    journalId,
  );

  if (isRefereeAssigned._unsafeUnwrap() !== true) {
    return sendError(res, 'Referee not assigned to submission', 400);
  }

  const updatedReview = await saveReview({
    reviewId,
    journalId,
    submissionId,
    refereeId,
    update: {
      recommendation,
      editorFeedback,
      authorFeedback,
      review,
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

  // TODO: Send email to editor and author

  const data = _.pick(updatedReview._unsafeUnwrap(), [
    'id',
    'recommendation',
    'editorFeedback',
    'authorFeedback',
    'review',
  ]);
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
    return sendError(res, 'Referee not assigned to submission', 400);
  }

  const updatedReview = await submitReview({
    reviewId,
    update: {
      recommendation,
      editorFeedback,
      authorFeedback,
      review,
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
  return sendSuccess(res, data);
};

type GetSubmissionReviewsRequest = ValidatedRequest<typeof createReviewSchema, AuthenticatedRequest>;
export const getSubmissionReviewsController = async (req: GetSubmissionReviewsRequest, res: Response) => {
  const { journalId, submissionId } = req.validatedData.params;

  const userId = req.user.id;
  const userRoleInJournal = await JournalManagementService.getUserJournalRole(journalId, userId);
  const isEditor = [EditorRole.CHIEF_EDITOR, EditorRole.ASSOCIATE_EDITOR].includes(userRoleInJournal._unsafeUnwrap());

  if (!isEditor) {
    const reviews = await getSubmissionReviews({ submissionId });
    return sendSuccess(res, reviews);
  }

  const isReferee = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
    submissionId,
    userId,
    journalId,
  );
  if (isReferee._unsafeUnwrap() === true) {
    const reviews = await getAllRefereeReviewsBySubmission({ submissionId, refereeId: userId });
    return sendSuccess(res, reviews);
  }

  const reviews = await getAuthorSubmissionReviews({ submissionId, authorId: userId });

  return sendSuccess(res, reviews);
};

type GetReviewByIdRequest = ValidatedRequest<typeof updateReviewSchema, AuthenticatedRequest>;
export const getReviewByIdController = async (req: GetReviewByIdRequest, res: Response) => {
  const { journalId, submissionId, reviewId } = req.validatedData.params;

  const userId = req.user.id;
  const userRoleInJournal = await JournalManagementService.getUserJournalRole(journalId, userId);
  const isEditor = userRoleInJournal.isOk();

  if (!isEditor) {
    const review = await getJournalReviewById({ journalId, reviewId });
    return sendSuccess(res, review);
  }

  const isReferee = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
    submissionId,
    userId,
    journalId,
  );
  if (isReferee._unsafeUnwrap() === true) {
    const review = await getJournalReviewById({ journalId, reviewId });
    return sendSuccess(res, review);
  }

  const isAuthor = await journalSubmissionService.isSubmissionByAuthor(submissionId, userId);
  if (isAuthor._unsafeUnwrap() === true) {
    const review = await getAuthorSubmissionReviews({ submissionId, authorId: userId });
    return sendSuccess(res, review);
  }

  return sendError(res, 'User is not authorized to view this review', 403);
};
