import { Router } from 'express';

import {
  createSubmission,
  updateSubmissionStatus,
  getSubmission,
  cancelUserSubmission,
} from '../../../controllers/communities/submissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validate } from '../../../middleware/validator.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

import {
  createSubmissionSchema,
  // updateSubmissionStatusSchema,
  getSubmissionSchema,
  rejectSubmissionSchema,
} from './submissions-schema.js';

const router = Router();

router.post('/', [ensureUser, validate(createSubmissionSchema)], asyncHandler(createSubmission));

router.patch(
  '/:submissionId/status',
  [ensureUser, validate(rejectSubmissionSchema)],
  asyncHandler(updateSubmissionStatus),
);

router.get('/:submissionId', [ensureUser, validate(getSubmissionSchema)], asyncHandler(getSubmission));

router.delete('/:submissionId', [ensureUser], asyncHandler(cancelUserSubmission));

export default router;
