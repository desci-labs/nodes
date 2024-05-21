import { Router } from 'express';

import { asyncHander, checkMintability, ensureUser, getDoi, mintDoi } from '../../internal.js';

const router = Router();

router.post('/check/:uuid', [ensureUser], asyncHander(checkMintability));
router.post('/mint/:uuid', [ensureUser], asyncHander(mintDoi));
router.get('/:identifier', [ensureUser], asyncHander(getDoi));

export default router;
