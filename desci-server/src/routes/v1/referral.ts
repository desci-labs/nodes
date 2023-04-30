import { Router } from 'express';

import { getReferralsByUserId, newReferral, acceptReferralById } from 'controllers/referral';
import { ensureUser } from 'middleware/ensureUser';

const router = Router();

router.get('/', [ensureUser], getReferralsByUserId);
router.post('/', [ensureUser], newReferral);
router.patch('/:referralUuid/accept', [ensureUser], acceptReferralById);

export default router;
