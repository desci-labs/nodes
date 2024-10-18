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

import {
  getCommunityRecommendations,
  getValidatedAttestations,
} from '../../../controllers/attestations/recommendations.js';
import { getAllFeeds, getCommunityDetails, getCommunityFeed } from '../../../controllers/communities/feed.js';
import { checkMemberGuard } from '../../../controllers/communities/guard.js';
import { listCommunities } from '../../../controllers/communities/list.js';
import { getCommunityRadar } from '../../../controllers/communities/radar.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validate } from '../../../middleware/validator.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

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
