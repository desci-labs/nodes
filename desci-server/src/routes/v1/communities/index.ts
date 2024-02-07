import { Router } from 'express';

import { asyncHander, getCommunityFeed, getCommunityRadar, listCommunities } from '../../../internal.js';
import { ensureUser } from '../../../middleware/permissions.js';

const router = Router();

// list all communities and curated nodes()
router.get('/list', [], asyncHander(listCommunities));
router.get('/:comunityId/feed', [], asyncHander(getCommunityFeed));
router.get('/:comunityId/radar', [], asyncHander(getCommunityRadar));
// router.get('/:comunityId/curated', [ensureUser], asyncHander(getCommunityRadar));
export default router;
