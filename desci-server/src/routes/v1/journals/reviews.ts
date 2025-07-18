import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import {
  createReviewController,
  getAssignmentsBySubmissionController,
  getReviewByIdController,
  getSubmissionReviewsController,
  submitReviewController,
  updateReviewController,
} from '../../../controllers/journals/reviews/index.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import {
  createReviewSchema,
  getAssignmentsBySubmissionSchema,
  reviewDetailsApiSchema,
  reviewsApiSchema,
  submitReviewSchema,
  updateReviewSchema,
} from '../../../schemas/journals.schema.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export default function reviewRoutes(router: Router) {
  // Reviews
  router.post(
    '/:journalId/submissions/:submissionId/reviews',
    [ensureUser, validateInputs(createReviewSchema)],
    asyncHandler(createReviewController),
  );

  router.patch(
    '/:journalId/submissions/:submissionId/reviews/:reviewId',
    [ensureUser, validateInputs(updateReviewSchema)],
    asyncHandler(updateReviewController),
  );

  // submit review route
  router.post(
    '/:journalId/submissions/:submissionId/reviews/:reviewId/submit',
    [ensureUser, validateInputs(submitReviewSchema)],
    asyncHandler(submitReviewController),
  );

  // get submission reviews route
  router.get(
    '/:journalId/submissions/:submissionId/reviews',
    [ensureUser, validateInputs(reviewsApiSchema)],
    asyncHandler(getSubmissionReviewsController),
  );

  // get review by id route
  router.get(
    '/:journalId/submissions/:submissionId/reviews/:reviewId',
    [ensureUser, validateInputs(reviewDetailsApiSchema)],
    asyncHandler(getReviewByIdController),
  );

  // Get all assignments for a submission (with reviews and form responses)
  router.get(
    '/:journalId/submissions/:submissionId/assignments',
    [
      ensureUser,
      ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
      validateInputs(getAssignmentsBySubmissionSchema),
    ],
    asyncHandler(getAssignmentsBySubmissionController),
  );
}
