import { Router } from 'express';

import {
  getAuthorNodesSchema,
  getAuthorProfile,
  getAuthorPublishedNodes,
  getAuthorSchema,
  getAuthorWorks,
  getAuthorWorksSchema,
} from '../../controllers/authors/index.js';
import { validate } from '../../middleware/validator.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.get('/:id', [validate(getAuthorSchema)], asyncHandler(getAuthorProfile));
router.get('/:id/works', [validate(getAuthorWorksSchema)], asyncHandler(getAuthorWorks));
router.get('/:orcid/publishedNodes', [validate(getAuthorNodesSchema)], asyncHandler(getAuthorPublishedNodes));
export default router;
