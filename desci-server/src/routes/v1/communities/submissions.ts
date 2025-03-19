import { Router } from 'express';

import {
  createSubmission,
  getCommunitySubmissions,
  getUserSubmissions,
  updateSubmissionStatus,
  getSubmission,
} from '../../../controllers/communities/submissions.js';
import { ensureNodeAccess } from '../../../middleware/authorisation.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validate } from '../../../middleware/validator.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

import {
  createSubmissionSchema,
  getCommunitySubmissionsSchema,
  getUserSubmissionsSchema,
  updateSubmissionStatusSchema,
  getSubmissionSchema,
} from './submissions-schema.js';

const router = Router();

// Routes
router.post('/', [ensureUser, ensureNodeAccess, validate(createSubmissionSchema)], asyncHandler(createSubmission));

router.get(
  '/communities/:communityId/submissions',
  [ensureUser, validate(getCommunitySubmissionsSchema)],
  asyncHandler(getCommunitySubmissions),
);

router.get(
  '/users/:userId/submissions',
  [ensureUser, validate(getUserSubmissionsSchema)],
  asyncHandler(getUserSubmissions),
);

router.patch(
  '/:submissionId/status',
  [ensureUser, validate(updateSubmissionStatusSchema)],
  asyncHandler(updateSubmissionStatus),
);

router.get('/:submissionId', [ensureUser, validate(getSubmissionSchema)], asyncHandler(getSubmission));

export default router;
