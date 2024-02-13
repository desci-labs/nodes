import { Router } from 'express';

import {
  asyncHander,
  getCommunityDetails,
  getCommunityFeed,
  getCommunityRadar,
  getCommunityRecommendations,
  listCommunities,
} from '../../../internal.js';

const router = Router();

// list all communities and curated nodes()
router.get('/list', [], asyncHander(listCommunities));
router.get('/:communityName', [], asyncHander(getCommunityDetails));
router.get('/:communityName/attestations', [], asyncHander(getCommunityRecommendations));
router.get('/:communityId/feed', [], asyncHander(getCommunityFeed));
router.get('/:communityId/radar', [], asyncHander(getCommunityRadar));

export default router;
