import { Router } from 'express';

import { asyncHandler, checkMintability, ensureNodeAccess, ensureUser, getDoi, mintDoi } from '../../internal.js';

const router = Router();

router.post('/check/:uuid', [ensureUser, ensureNodeAccess], asyncHandler(checkMintability));
router.post('/mint/:uuid', [ensureUser, ensureNodeAccess], asyncHandler(mintDoi));
router.get('/:identifier', [ensureUser], asyncHandler(getDoi));

export default router;
