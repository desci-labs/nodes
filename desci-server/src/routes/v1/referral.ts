import { Router } from 'express';

import { acceptReferralById } from '../../controllers/referral/acceptReferralById.js';
import { newReferral } from '../../controllers/referral/newReferral.js';
import { ensureUser } from '../../middleware/ensureUser.js';
import { getReferralsByUserId } from '../../services/friendReferral.js';

const router = Router();

router.get('/', [ensureUser], getReferralsByUserId);
router.post('/', [ensureUser], newReferral);
router.patch('/:referralUuid/accept', [ensureUser], acceptReferralById);

export default router;
