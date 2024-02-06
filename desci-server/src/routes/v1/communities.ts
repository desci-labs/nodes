import { Router } from 'express';

import { ensureUser } from '../../middleware/permissions.js';

const router = Router();

// list all communities and curated nodes()
router.get('/', [ensureUser], () => {});
router.get('/:desciCommunityId/feed', [ensureUser], () => {});
export default router;
