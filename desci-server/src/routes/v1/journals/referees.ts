import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import { listRefereeAssignmentsController } from '../../../controllers/journals/referees/index.js';
import { invalidateRefereeAssignmentController } from '../../../controllers/journals/referees/invalidateRefereeAssignment.js';
import {
  getRefereeInvitesController,
  inviteRefereeController,
} from '../../../controllers/journals/referees/inviteReferee.js';
import { refereeInviteDecisionController } from '../../../controllers/journals/referees/refereeInviteDecision.js';
import { sendRefereeReviewReminderController } from '../../../controllers/journals/referees/sendRefereeReviewReminder.js';
import { getReviewsByAssignmentController } from '../../../controllers/journals/reviews/index.js';
import { attachUser } from '../../../middleware/attachUser.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import {
  getReviewsByAssignmentSchema,
  invalidateRefereeAssignmentSchema,
  inviteRefereeSchema,
  refereeInviteDecisionSchema,
  sendRefereeReviewReminderSchema,
} from '../../../schemas/journals.schema.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export default function refereeRoutes(router: Router) {
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

  router.post(
    '/:journalId/submissions/:submissionId/referee/reminder',
    [
      ensureUser,
      validateInputs(sendRefereeReviewReminderSchema),
      ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
    ],
    asyncHandler(sendRefereeReviewReminderController),
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

  // Get reviews by assignment
  router.get(
    '/referee/assignments/:assignmentId/reviews',
    [ensureUser, validateInputs(getReviewsByAssignmentSchema)],
    asyncHandler(getReviewsByAssignmentController),
  );
}
