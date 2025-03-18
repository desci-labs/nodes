import { Router } from 'express';

import { list, associateWallet, updateProfile, associateOrcidWallet } from '../../controllers/users/index.js';
import { addPublishedWallet } from '../../controllers/users/publishedWallets/create.js';
import { getUserPublishedWallets } from '../../controllers/users/publishedWallets/index.js';
import { searchProfiles } from '../../controllers/users/search.js';
import { usage } from '../../controllers/users/usage.js';
import { ensureAdmin } from '../../middleware/ensureAdmin.js';
import { ensureUser } from '../../middleware/permissions.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.get('/usage', [ensureUser], usage);
router.get('/', [ensureUser, ensureAdmin], list);
router.post('/associate', [ensureUser], associateWallet);
router.post('/orcid/associate', [ensureUser], associateOrcidWallet);
router.patch('/updateProfile', [ensureUser], updateProfile);
router.get('/search', [ensureUser], searchProfiles);

// Published wallet logging
router.get('/addresses', [ensureUser], asyncHandler(getUserPublishedWallets));
router.post('/addresses', [ensureUser], asyncHandler(addPublishedWallet));

export default router;
