import { Router } from 'express';

import {
  asyncHandler,
  checkMintability,
  ensureNodeAccess,
  ensureUser,
  getDoi,
  getDoiSchema,
  mintDoi,
  validate,
} from '../../internal.js';

const router = Router();

router.post('/check/:uuid', [ensureUser, ensureNodeAccess], asyncHandler(checkMintability));
router.post('/mint/:uuid', [ensureUser, ensureNodeAccess], asyncHandler(mintDoi));
router.get('/', [validate(getDoiSchema)], asyncHandler(getDoi));

export default router;
