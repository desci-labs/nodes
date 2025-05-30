import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import { editorInviteDecision } from '../../../controllers/journals/invites/editorInviteDecision.js';
import { inviteEditor } from '../../../controllers/journals/invites/inviteEditor.js';
import { listJournalsController } from '../../../controllers/journals/list.js';
import { createJournalController } from '../../../controllers/journals/management/create.js';
import { removeEditorController } from '../../../controllers/journals/management/removeEditor.js';
import { updateJournalController } from '../../../controllers/journals/management/update.js';
import { updateEditorController } from '../../../controllers/journals/management/updateEditor.js';
import { updateEditorRoleController } from '../../../controllers/journals/management/updateRole.js';
import { invalidateRefereeAssignmentController } from '../../../controllers/journals/referees/invalidateRefereeAssignment.js';
import { inviteRefereeController } from '../../../controllers/journals/referees/inviteReferee.js';
import { refereeInviteDecisionController } from '../../../controllers/journals/referees/refereeInviteDecision.js';
import {
  createReviewController,
  getReviewByIdController,
  getSubmissionReviewsController,
  submitReviewController,
  updateReviewController,
} from '../../../controllers/journals/reviews/index.js';
import { showJournalController } from '../../../controllers/journals/show.js';
import {
  assignSubmissionToEditorController,
  createJournalSubmissionController,
  getAuthorSubmissionsController,
  listJournalSubmissionsController,
} from '../../../controllers/journals/submissions/index.js';
import { attachUser } from '../../../middleware/attachUser.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import {
  assignSubmissionToEditorSchema,
  createJournalSchema,
  createJournalSubmissionSchema,
  createReviewSchema,
  editorInviteDecisionSchema,
  getAuthorJournalSubmissionsSchema,
  getJournalSchema,
  inviteEditorSchema,
  listJournalSubmissionsSchema,
  removeEditorSchema,
  reviewDetailsApiSchema,
  reviewsApiSchema,
  submitReviewSchema,
  updateEditorRoleSchema,
  updateJournalSchema,
  updateReviewSchema,
  inviteRefereeSchema,
  refereeInviteDecisionSchema,
  invalidateRefereeAssignmentSchema,
  updateEditorSchema,
} from '../../../schemas/journals.schema.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// General
router.get('/', listJournalsController);
router.get('/:journalId', [attachUser, validateInputs(getJournalSchema)], showJournalController);

// Invites
router.post(
  '/:journalId/invites/editor',
  [ensureUser, validateInputs(inviteEditorSchema), ensureJournalRole(EditorRole.CHIEF_EDITOR)],
  inviteEditor,
);
router.post(
  '/:journalId/invitation/editor',
  [attachUser, validateInputs(editorInviteDecisionSchema)],
  editorInviteDecision,
); // editor accept/deny route

// Management
router.post('/', [ensureUser, validateInputs(createJournalSchema)], createJournalController);
router.patch(
  '/:journalId',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateJournalSchema)],
  updateJournalController,
);
router.patch(
  '/:journalId/editors/:editorId/manage', // This route is for CHIEF_EDITORS to manage editors.
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateEditorRoleSchema)],
  updateEditorRoleController,
);
router.patch(
  '/:journalId/editors/:editorId/settings', // This route is for EDITORS to manage their own settings.
  [
    ensureUser,
    ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
    validateInputs(updateEditorSchema),
  ],
  updateEditorController,
);

router.delete(
  '/:journalId/editors/:editorId',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(removeEditorSchema)],
  removeEditorController,
);

// Submissions
router.post(
  '/:journalId/submissions',
  [ensureUser, validateInputs(createJournalSubmissionSchema)],
  asyncHandler(createJournalSubmissionController),
);

router.post(
  '/:journalId/submissions/:submissionId/assign',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(assignSubmissionToEditorSchema)],
  asyncHandler(assignSubmissionToEditorController),
);

router.get(
  '/:journalId/submissions',
  [ensureUser, validateInputs(listJournalSubmissionsSchema)],
  asyncHandler(listJournalSubmissionsController),
);

router.get(
  '/:journalId/my-submissions/:authorId',
  [ensureUser, validateInputs(getAuthorJournalSubmissionsSchema)],
  asyncHandler(getAuthorSubmissionsController),
);

// Reviews
router.post(
  '/:journalId/submissions/:submissionId/reviews',
  [ensureUser, validateInputs(createReviewSchema)],
  asyncHandler(createReviewController),
);

router.put(
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

// Referee Management for Submissions
router.post(
  '/:journalId/submissions/:submissionId/referee/invite',
  [ensureUser, validateInputs(inviteRefereeSchema), ensureJournalRole(EditorRole.CHIEF_EDITOR)],
  asyncHandler(inviteRefereeController),
);

router.post(
  '/:journalId/submissions/:submissionId/referee/invite/decision',
  [attachUser, validateInputs(refereeInviteDecisionSchema)],
  asyncHandler(refereeInviteDecisionController),
);

// Disable for now
// router.patch(
//   '/:journalId/submissions/:submissionId/referees/:assignmentId/invalidate',
//   [ensureUser, validateInputs(invalidateRefereeAssignmentSchema), ensureJournalRole(EditorRole.CHIEF_EDITOR)],
//   asyncHandler(invalidateRefereeAssignmentController),
// );

export default router;
