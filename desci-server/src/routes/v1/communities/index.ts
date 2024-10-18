import { Router } from 'express';

// import {
//   asyncHandler,
//   checkMemberGuard,
//   ensureUser,
//   getAllFeeds,
//   getCommunityDetails,
//   getCommunityFeed,
//   getCommunityRadar,
//   getCommunityRecommendations,
//   getValidatedAttestations,
//   listCommunities,
//   validate,
// } from '../../../internal.js';

import { getCommunityDetailsSchema, getCommunityFeedSchema, memberGuardSchema } from './schema.js';

const router = Router();

// list all communities and curated nodes()
router.get('/list', [], asyncHandler(listCommunities));
router.get('/feeds', [], asyncHandler(getAllFeeds));
router.get('/:communityName', [validate(getCommunityDetailsSchema)], asyncHandler(getCommunityDetails));
router.get(
  '/:communityName/attestations',
  [validate(getCommunityDetailsSchema)],
  asyncHandler(getCommunityRecommendations),
);

router.get(
  '/:communityName/validatedAttestations',
  [validate(getCommunityDetailsSchema)],
  asyncHandler(getValidatedAttestations),
);

router.get('/:communityId/feed', [validate(getCommunityFeedSchema)], asyncHandler(getCommunityFeed));
router.get('/:communityId/radar', [validate(getCommunityFeedSchema)], asyncHandler(getCommunityRadar));

router.post('/:communityId/memberGuard', [ensureUser, validate(memberGuardSchema)], asyncHandler(checkMemberGuard));

export default router;
