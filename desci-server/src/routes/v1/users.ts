import { Router } from 'express';

import { list, associateWallet, updateProfile, associateOrcidWallet } from 'controllers/users';
import { usage } from 'controllers/users/usage';
import { checkJwt } from 'middleware/checkJwt';
import { ensureAdmin } from 'middleware/ensureAdmin';
import { ensureUser } from 'middleware/ensureUser';

const router = Router();

router.get('/usage', [ensureUser], usage);
router.get('/', [ensureUser, ensureAdmin], list);
router.post('/associate', [ensureUser], associateWallet);
router.post('/orcid/associate', [ensureUser], associateOrcidWallet);
router.patch('/updateProfile', [ensureUser], updateProfile);

export default router;
