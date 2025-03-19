import { Router } from 'express';

import {
  getCommunityRecommendations,
  getValidatedAttestations,
} from '../../../controllers/attestations/recommendations.js';
import {
  getAllFeeds,
  getCommunityDetails,
  getCommunityFeed,
  listAllCommunityCuratedFeeds,
  listCommunityFeed,
} from '../../../controllers/communities/feed.js';
import { checkMemberGuard } from '../../../controllers/communities/guard.js';
import { listCommunities } from '../../../controllers/communities/list.js';
import { getCommunityRadar, listCommunityRadar } from '../../../controllers/communities/radar.js';
import { getCommunitySubmissions } from '../../../controllers/communities/submissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validate } from '../../../middleware/validator.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

import {
  getAllCommunitiesFeedSchema,
  getCommunityDetailsSchema,
  getCommunityFeedSchema,
  memberGuardSchema,
} from './schema.js';
import { getCommunitySubmissionsSchema } from './submissions-schema.js';
import submissionsRouter from './submissions.js';

const router = Router();

// list all communities and curated nodes()
router.get('/list', [], asyncHandler(listCommunities));
router.get('/feeds', [validate(getAllCommunitiesFeedSchema)], asyncHandler(listAllCommunityCuratedFeeds));
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

// router.get('/:communityId/feed', [validate(getCommunityFeedSchema)], asyncHandler(getCommunityFeed));
// router.get('/:communityId/radar', [validate(getCommunityFeedSchema)], asyncHandler(getCommunityRadar));

router.get('/:communityId/feed', [validate(getCommunityFeedSchema)], asyncHandler(listCommunityFeed));
router.get('/:communityId/radar', [validate(getCommunityFeedSchema)], asyncHandler(listCommunityRadar));

router.post('/:communityId/memberGuard', [ensureUser, validate(memberGuardSchema)], asyncHandler(checkMemberGuard));

router.get(
  '/:communityId/submissions',
  [ensureUser, validate(getCommunitySubmissionsSchema)],
  asyncHandler(getCommunitySubmissions),
);

export default router;
