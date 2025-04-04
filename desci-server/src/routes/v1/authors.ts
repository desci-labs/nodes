import { Router } from 'express';

import {
  getAuthorProfile,
  getAuthorSchema,
  getAuthorWorks,
  getAuthorWorksSchema,
} from '../../controllers/authors/index.js';
import { validate } from '../../middleware/validator.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.get('/:id', [validate(getAuthorSchema)], asyncHandler(getAuthorProfile));
router.get('/:id/works', [validate(getAuthorWorksSchema)], asyncHandler(getAuthorWorks));
export default router;
