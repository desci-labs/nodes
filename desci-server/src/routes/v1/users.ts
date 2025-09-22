import { Router } from 'express';

import { getUserSubmissions } from '../../controllers/communities/submissions.js';
import { consentSciweave } from '../../controllers/nodes/consent.js';
import { list, associateWallet, updateProfile, associateOrcidWallet } from '../../controllers/users/index.js';
import { addPublishedWallet } from '../../controllers/users/publishedWallets/create.js';
import { getUserPublishedWallets } from '../../controllers/users/publishedWallets/index.js';
import { searchProfiles } from '../../controllers/users/search.js';
import { submitQuestionnaire } from '../../controllers/users/submitQuestionnaire.js';
import { submitSciweaveQuestionnaire } from '../../controllers/users/submitSciweaveQuestionnaire.js';
import { updateSciweaveMarketingConsentController } from '../../controllers/users/sciweaveMarketingConsent.js';
import { usage } from '../../controllers/users/usage.js';
import { ensureAdmin } from '../../middleware/ensureAdmin.js';
import { ensureGuestOrUser, ensureUser } from '../../middleware/permissions.js';
import { validate } from '../../middleware/validator.js';
import { submitQuestionnaireSchema, updateMarketingConsentSchema } from '../../schemas/users.schema.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

import { getUserSubmissionsSchema } from './communities/submissions-schema.js';

const router = Router();

router.get('/usage', [ensureGuestOrUser], usage);
router.get('/', [ensureUser, ensureAdmin], list);
router.post('/associate', [ensureUser], associateWallet);
router.post('/orcid/associate', [ensureUser], associateOrcidWallet);
router.patch('/updateProfile', [ensureUser], updateProfile);
router.get('/search', [ensureGuestOrUser], searchProfiles);
router.get('/:userId/submissions', [ensureUser, validate(getUserSubmissionsSchema)], asyncHandler(getUserSubmissions));
router.post('/sciweave/consent', [ensureUser], consentSciweave);

// Published wallet logging
router.get('/addresses', [ensureUser], asyncHandler(getUserPublishedWallets));
router.post('/addresses', [ensureUser], asyncHandler(addPublishedWallet));

router.post('/questionnaire', [ensureUser, validate(submitQuestionnaireSchema)], asyncHandler(submitQuestionnaire));
router.post(
  '/sciweave/questionnaire',
  [ensureUser, validate(submitQuestionnaireSchema)],
  asyncHandler(submitSciweaveQuestionnaire),
);
router.patch(
  '/sciweave/marketing-consent',
  [ensureUser, validate(updateMarketingConsentSchema)],
  asyncHandler(updateSciweaveMarketingConsentController),
);

export default router;
