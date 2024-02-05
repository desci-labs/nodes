import { Router } from 'express';

import { listCommunities } from '../../controllers/community/list.js';
import { listCurated } from '../../controllers/community/listCurated.js';
import { showCommunity } from '../../controllers/community/show.js';

const router = Router();

router.get('/list', [], listCommunities);
router.get('/:communityId', [], showCommunity);
router.get('/:communityId/curated', [], listCurated);

export default router;
