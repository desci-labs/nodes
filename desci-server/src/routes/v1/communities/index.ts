import { Router } from 'express';

import {
  asyncHander,
  checkMemberGuard,
  ensureUser,
  getAllFeeds,
  getCommunityDetails,
  getCommunityFeed,
  getCommunityRadar,
  getCommunityRecommendations,
  getValidatedAttestations,
  listCommunities,
  validate,
} from '../../../internal.js';

import { getCommunityDetailsSchema, getCommunityFeedSchema, memberGuardSchema } from './schema.js';

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

router.get(
  '/:communityName/validatedAttestations',
  [validate(getCommunityDetailsSchema)],
  asyncHander(getValidatedAttestations),
);

router.get('/:communityId/feed', [validate(getCommunityFeedSchema)], asyncHander(getCommunityFeed));
router.get('/:communityId/radar', [validate(getCommunityFeedSchema)], asyncHander(getCommunityRadar));

router.post('/:communityId/memberGuard', [ensureUser, validate(memberGuardSchema)], asyncHander(checkMemberGuard));

export default router;
