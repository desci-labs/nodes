import { Router } from 'express';

import {
  asyncHander,
  getAllFeeds,
  getCommunityDetails,
  getCommunityFeed,
  getCommunityRadar,
  getCommunityRecommendations,
  listCommunities,
  validate,
} from '../../../internal.js';

import { getCommunityDetailsSchema, getCommunityFeedSchema } from './schema.js';

const router = Router();

// list all communities and curated nodes()
router.get('/list', [], asyncHander(listCommunities));
router.get('/feeds', [], asyncHander(getAllFeeds));
router.get('/:communityName', [validate(getCommunityDetailsSchema)], asyncHander(getCommunityDetails));
router.get(
  '/:communityName/attestations',
  [validate(getCommunityDetailsSchema)],
  asyncHander(getCommunityRecommendations),
);
router.get('/:communityId/feed', [validate(getCommunityFeedSchema)], asyncHander(getCommunityFeed));
router.get('/:communityId/radar', [validate(getCommunityFeedSchema)], asyncHander(getCommunityRadar));

export default router;
