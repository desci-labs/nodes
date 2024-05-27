import { Router } from 'express';

import { asyncHander, checkMintability, ensureNodeAccess, ensureUser, getDoi, mintDoi } from '../../internal.js';

const router = Router();

router.post('/check/:uuid', [ensureUser, ensureNodeAccess], asyncHander(checkMintability));
router.post('/mint/:uuid', [ensureUser, ensureNodeAccess], asyncHander(mintDoi));
router.get('/:identifier', [ensureUser], asyncHander(getDoi));

export default router;
