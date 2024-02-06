import { Router } from 'express';

import { asyncHander, getCommunityFeed, getCommunityRadar, listCommunities } from '../../../internal.js';
import { ensureUser } from '../../../middleware/permissions.js';

const router = Router();

// list all communities and curated nodes()
router.get('/', [ensureUser], asyncHander(listCommunities));
router.get('/:desciCommunityId/feed', [ensureUser], asyncHander(getCommunityFeed));
router.get('/:desciCommunityId/radar', [ensureUser], asyncHander(getCommunityRadar));
export default router;
