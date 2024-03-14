import { Router } from 'express';

import { list, associateWallet, updateProfile, associateOrcidWallet } from '../../controllers/users/index.js';
import { searchProfiles } from '../../controllers/users/search.js';
import { usage } from '../../controllers/users/usage.js';
import { ensureAdmin } from '../../middleware/ensureAdmin.js';
import { ensureUser } from '../../middleware/permissions.js';

const router = Router();

router.get('/usage', [ensureUser], usage);
router.get('/', [ensureUser, ensureAdmin], list);
router.post('/associate', [ensureUser], associateWallet);
router.post('/orcid/associate', [ensureUser], associateOrcidWallet);
router.patch('/updateProfile', [ensureUser], updateProfile);
router.get('/search', [ensureUser], searchProfiles);

export default router;
