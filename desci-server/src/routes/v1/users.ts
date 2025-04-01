import { Router } from 'express';

import { getUserSubmissions } from '../../controllers/communities/submissions.js';
import { list, associateWallet, updateProfile, associateOrcidWallet } from '../../controllers/users/index.js';
import { addPublishedWallet } from '../../controllers/users/publishedWallets/create.js';
import { getUserPublishedWallets } from '../../controllers/users/publishedWallets/index.js';
import { searchProfiles } from '../../controllers/users/search.js';
import { usage } from '../../controllers/users/usage.js';
import { ensureAdmin } from '../../middleware/ensureAdmin.js';
import { ensureUser } from '../../middleware/permissions.js';
import { validate } from '../../middleware/validator.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

import { getUserSubmissionsSchema } from './communities/submissions-schema.js';

const router = Router();

router.get('/usage', [ensureUser], usage);
router.get('/', [ensureUser, ensureAdmin], list);
router.post('/associate', [ensureUser], associateWallet);
router.post('/orcid/associate', [ensureUser], associateOrcidWallet);
router.patch('/updateProfile', [ensureUser], updateProfile);
router.get('/search', [ensureUser], searchProfiles);
router.get('/:userId/submissions', [ensureUser, validate(getUserSubmissionsSchema)], asyncHandler(getUserSubmissions));

// Published wallet logging
router.get('/addresses', [ensureUser], asyncHandler(getUserPublishedWallets));
router.post('/addresses', [ensureUser], asyncHandler(addPublishedWallet));

export default router;
