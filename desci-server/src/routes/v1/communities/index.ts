import { Router } from 'express';

import { asyncHander, getCommunityFeed, getCommunityRadar, listCommunities } from '../../../internal.js';
import { ensureUser } from '../../../middleware/permissions.js';

const router = Router();

// list all communities and curated nodes()
router.get('/list', [], asyncHander(listCommunities));
router.get('/:communityId/feed', [], asyncHander(getCommunityFeed));
router.get('/:communityId/radar', [], asyncHander(getCommunityRadar));
export default router;
