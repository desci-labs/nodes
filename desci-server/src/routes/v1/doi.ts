import { Router } from 'express';

import {
  asyncHander,
  attachDoi,
  attachDoiSchema,
  checkMintability,
  ensureNodeAccess,
  ensureUser,
  getDoi,
  mintDoi,
  validate,
} from '../../internal.js';
const router = Router();

router.post('/check/:uuid', [ensureUser, ensureNodeAccess], asyncHander(checkMintability));
router.post('/mint/:uuid', [ensureUser, ensureNodeAccess], asyncHander(mintDoi));
router.post('/attach', [ensureUser, ensureNodeAccess, validate(attachDoiSchema)], asyncHander(attachDoi));
router.get('/:identifier', [ensureUser], asyncHander(getDoi));

export default router;
