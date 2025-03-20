import { Router } from 'express';

import {
  createSubmission,
  updateSubmissionStatus,
  getSubmission,
} from '../../../controllers/communities/submissions.js';
import { ensureNodeAccess } from '../../../middleware/authorisation.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validate } from '../../../middleware/validator.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

import { createSubmissionSchema, updateSubmissionStatusSchema, getSubmissionSchema } from './submissions-schema.js';

const router = Router();

router.post('/', [ensureUser, validate(createSubmissionSchema)], asyncHandler(createSubmission));

router.patch(
  '/:submissionId/status',
  [ensureUser, validate(updateSubmissionStatusSchema)],
  asyncHandler(updateSubmissionStatus),
);

router.get('/:submissionId', [ensureUser, validate(getSubmissionSchema)], asyncHandler(getSubmission));

export default router;
