import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import { showJournalAnalyticsController } from '../../../controllers/journals/dashboard/analytics.js';
import { showUrgentJournalSubmissionsController } from '../../../controllers/journals/dashboard/urgentSubmissions.js';
import { createFormTemplateController } from '../../../controllers/journals/forms/createTemplate.js';
import { getFormResponseController } from '../../../controllers/journals/forms/getFormResponse.js';
import { getFormTemplateController } from '../../../controllers/journals/forms/getFormTemplate.js';
import { listFormTemplatesController } from '../../../controllers/journals/forms/listTemplates.js';
import { saveFormResponseController } from '../../../controllers/journals/forms/saveFormResponse.js';
import { submitFormResponseController } from '../../../controllers/journals/forms/submitFormResponse.js';
import { updateFormTemplateController } from '../../../controllers/journals/forms/updateTemplate.js';
import { editorInviteDecision } from '../../../controllers/journals/invites/editorInviteDecision.js';
import { inviteEditor, listJournalEditors } from '../../../controllers/journals/invites/inviteEditor.js';
import { listJournalsController } from '../../../controllers/journals/list.js';
import { createJournalController } from '../../../controllers/journals/management/create.js';
import { getJournalSettingsController } from '../../../controllers/journals/management/getJournalSettings.js';
import { removeEditorController } from '../../../controllers/journals/management/removeEditor.js';
import { updateJournalController } from '../../../controllers/journals/management/update.js';
import { updateEditorController } from '../../../controllers/journals/management/updateEditor.js';
import { updateJournalSettingsController } from '../../../controllers/journals/management/updateJournalSettings.js';
import { updateEditorRoleController } from '../../../controllers/journals/management/updateRole.js';
import { getRefereeFormStatusController } from '../../../controllers/journals/referees/getRefereeFormStatus.js';
import { listRefereeAssignmentsController } from '../../../controllers/journals/referees/index.js';
import { invalidateRefereeAssignmentController } from '../../../controllers/journals/referees/invalidateRefereeAssignment.js';
import {
  getRefereeInvitesController,
  inviteRefereeController,
} from '../../../controllers/journals/referees/inviteReferee.js';
import { refereeInviteDecisionController } from '../../../controllers/journals/referees/refereeInviteDecision.js';
import {
  createReviewController,
  getReviewByIdController,
  getReviewsByAssignmentController,
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
  getJournalSubmissionController,
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
  getFormResponseSchema,
  getFormTemplateSchema,
  getJournalSchema,
  getReviewsByAssignmentSchema,
  inviteEditorSchema,
  invalidateRefereeAssignmentSchema,
  inviteRefereeSchema,
  listFormTemplatesSchema,
  listJournalEditorsSchema,
  listJournalSubmissionsSchema,
  listJournalsSchema,
  refereeInviteDecisionSchema,
  rejectSubmissionSchema,
  removeEditorSchema,
  requestRevisionSchema,
  revisionActionSchema,
  revisionApiSchema,
  reviewDetailsApiSchema,
  reviewsApiSchema,
  submitFormResponseSchema,
  submitReviewSchema,
  submissionApiSchema,
  submitRevisionSchema,
  updateEditorRoleSchema,
  updateEditorSchema,
  updateFormTemplateSchema,
  updateJournalSchema,
  updateReviewSchema,
  createFormTemplateSchema,
  getJournalAnalyticsSchema,
  showUrgentSubmissionsSchema,
  getJournalSettingsSchema,
  updateJournalSettingsSchema,
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
router.get(
  '/:journalId/editors',
  [ensureUser, validateInputs(listJournalEditorsSchema), ensureJournalRole(EditorRole.CHIEF_EDITOR)],
  asyncHandler(listJournalEditors),
);
router.post(
  '/:journalId/invites/editor',
  [ensureUser, validateInputs(inviteEditorSchema), ensureJournalRole(EditorRole.CHIEF_EDITOR)],
  asyncHandler(inviteEditor),
);
router.post(
  '/:journalId/invitation/editor',
  [attachUser, validateInputs(editorInviteDecisionSchema)],
  asyncHandler(editorInviteDecision),
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

router.get(
  '/:journalId/settings',
  [
    ensureUser,
    ensureJournalRole([EditorRole.CHIEF_EDITOR, EditorRole.ASSOCIATE_EDITOR]),
    validateInputs(getJournalSettingsSchema),
  ],
  asyncHandler(getJournalSettingsController),
);

router.patch(
  '/:journalId/settings',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateJournalSettingsSchema)],
  asyncHandler(updateJournalSettingsController),
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
  '/:journalId/submissions/:submissionId',
  [ensureUser, validateInputs(submissionApiSchema)],
  asyncHandler(getJournalSubmissionController),
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

// referee getter apis
router.get('/referee/assignments', [ensureUser], asyncHandler(listRefereeAssignmentsController));
router.get('/referee/invitations', [ensureUser], asyncHandler(getRefereeInvitesController));

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

// Form Template Routes
router.post(
  '/:journalId/forms/templates',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(createFormTemplateSchema)],
  asyncHandler(createFormTemplateController),
);

router.get(
  '/:journalId/forms/templates',
  [
    ensureUser,
    ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
    validateInputs(listFormTemplatesSchema),
  ],
  asyncHandler(listFormTemplatesController),
);

router.get(
  '/:journalId/forms/templates/:templateId',
  [ensureUser, validateInputs(getFormTemplateSchema)],
  asyncHandler(getFormTemplateController),
);

router.patch(
  '/:journalId/forms/templates/:templateId',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateFormTemplateSchema)],
  asyncHandler(updateFormTemplateController),
);

// Form Response Routes (Referees)
router.get(
  '/:journalId/forms/response/:assignmentId/:templateId',
  [ensureUser, validateInputs(getFormResponseSchema)],
  asyncHandler(getFormResponseController),
);

router.put('/:journalId/forms/response/:responseId', [ensureUser], asyncHandler(saveFormResponseController));

router.post(
  '/:journalId/forms/response/:responseId/submit',
  [ensureUser, validateInputs(submitFormResponseSchema)],
  asyncHandler(submitFormResponseController),
);

// Referee form status
router.get(
  '/:journalId/submissions/:submissionId/referees/assignments/:assignmentId/form-status',
  [ensureUser],
  asyncHandler(getRefereeFormStatusController),
);

// Get reviews by assignment
router.get(
  '/referee/assignments/:assignmentId/reviews',
  [ensureUser, validateInputs(getReviewsByAssignmentSchema)],
  asyncHandler(getReviewsByAssignmentController),
);

// admin dashboard apis
router.get(
  '/:journalId/analytics',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(getJournalAnalyticsSchema)],
  asyncHandler(showJournalAnalyticsController),
);

router.get(
  '/:journalId/urgentSubmissions',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(showUrgentSubmissionsSchema)],
  asyncHandler(showUrgentJournalSubmissionsController),
);

export default router;
