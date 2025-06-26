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
import { listRefereeAssignmentsController } from '../../../controllers/journals/referees/index.js';
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
import {
  getRevisionByIdController,
  getRevisionsController,
  revisionActionController,
  submitRevisionController,
} from '../../../controllers/journals/revision/index.js';
import { showJournalController, showJournalProfileController } from '../../../controllers/journals/show.js';
import {
  assignSubmissionToEditorController,
  createJournalSubmissionController,
  getAuthorSubmissionsController,
  listJournalSubmissionsController,
  rejectSubmissionController,
  acceptSubmissionController,
  requestRevisionController,
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
  submissionApiSchema,
  requestRevisionSchema,
  submitRevisionSchema,
  rejectSubmissionSchema,
  revisionActionSchema,
  revisionApiSchema,
  listJournalsSchema,
  listRefereeAssignmentsSchema,
} from '../../../schemas/journals.schema.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// General
router.get('/', [attachUser, validateInputs(listJournalsSchema)], asyncHandler(listJournalsController));
router.get('/profile', [ensureUser], asyncHandler(showJournalProfileController));
router.get(
  '/:journalId',
  [
    ensureUser,
    ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
    validateInputs(getJournalSchema),
  ],
  showJournalController,
);

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
  '/:journalId/editors/:editorUserId/manage', // This route is for CHIEF_EDITORS to manage editors.
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateEditorRoleSchema)],
  updateEditorRoleController,
);
router.patch(
  '/:journalId/editors/:editorUserId/settings', // This route is for EDITORS to manage their own settings.
  [
    ensureUser,
    ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
    validateInputs(updateEditorSchema),
  ],
  updateEditorController,
);

router.delete(
  '/:journalId/editors/:editorUserId',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(removeEditorSchema)],
  removeEditorController,
);

// referee assignments
router.get('/referee-assignments', [ensureUser], asyncHandler(listRefereeAssignmentsController));

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
  '/:journalId/my-submissions',
  [ensureUser, validateInputs(getAuthorJournalSubmissionsSchema)],
  asyncHandler(getAuthorSubmissionsController),
);

// submission action routes
router.post(
  '/:journalId/submissions/:submissionId/request-revision',
  [
    ensureUser,
    ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
    validateInputs(requestRevisionSchema),
  ],
  asyncHandler(requestRevisionController),
);

router.post(
  '/:journalId/submissions/:submissionId/accept',
  [
    ensureUser,
    ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
    validateInputs(submissionApiSchema),
  ],
  asyncHandler(acceptSubmissionController),
);

router.post(
  '/:journalId/submissions/:submissionId/reject',
  [
    ensureUser,
    ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
    validateInputs(rejectSubmissionSchema),
  ],
  asyncHandler(rejectSubmissionController),
);

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

// Referee Management for Submissions
router.post(
  '/:journalId/submissions/:submissionId/referee/invite',
  [
    ensureUser,
    validateInputs(inviteRefereeSchema),
    ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
  ],
  asyncHandler(inviteRefereeController),
);

router.post(
  '/:journalId/submissions/:submissionId/referee/invite/decision',
  [attachUser, validateInputs(refereeInviteDecisionSchema)],
  asyncHandler(refereeInviteDecisionController),
);

// CHIEF_EDITORS can invalidate referee assignments.
// ASSOCIATE_EDITORS can invalidate referee assignments for submissions they're handling.
// REFEREES can invalidate referee assignments they're assigned to.
// Handled inside the service.
router.patch(
  '/:journalId/submissions/:submissionId/referees/:assignmentId/invalidate',
  [ensureUser, validateInputs(invalidateRefereeAssignmentSchema)],
  asyncHandler(invalidateRefereeAssignmentController),
);

// Journal revision routes
router.post(
  '/:journalId/submissions/:submissionId/revisions',
  [ensureUser, validateInputs(submitRevisionSchema)],
  asyncHandler(submitRevisionController),
);
router.get(
  '/:journalId/submissions/:submissionId/revisions',
  [ensureUser, validateInputs(submissionApiSchema)],
  asyncHandler(getRevisionsController),
);

router.get(
  '/:journalId/submissions/:submissionId/revisions/:revisionId',
  [ensureUser, validateInputs(revisionApiSchema)],
  asyncHandler(getRevisionByIdController),
);

router.post(
  '/:journalId/submissions/:submissionId/revisions/:revisionId/action',
  [ensureUser, ensureJournalRole(EditorRole.ASSOCIATE_EDITOR), validateInputs(revisionActionSchema)],
  asyncHandler(revisionActionController),
);

export default router;
