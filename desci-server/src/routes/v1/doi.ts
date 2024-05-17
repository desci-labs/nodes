import { Router } from 'express';

import { asyncHander, checkMintability, ensureUser, mintDoi } from '../../internal.js';

const router = Router();

router.post('/check/:uuid', [ensureUser], asyncHander(checkMintability));
router.post('/mint/:uuid', [ensureUser], asyncHander(mintDoi));

export default router;
