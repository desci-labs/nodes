import { Router } from 'express';

import {
  asyncHandler,
  checkMintability,
  ensureNodeAccess,
  ensureUser,
  retrieveDoi,
  retrieveDoiSchema,
  mintDoi,
  validate,
} from '../../internal.js';

const router = Router();

router.post('/check/:uuid', [ensureUser, ensureNodeAccess], asyncHandler(checkMintability));
router.post('/mint/:uuid', [ensureUser, ensureNodeAccess], asyncHandler(mintDoi));
router.get('/', [validate(retrieveDoiSchema)], asyncHandler(retrieveDoi));

export default router;
