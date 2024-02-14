import { Router } from 'express';

import {
  asyncHander,
  addComment,
  addReaction,
  addVerification,
  removeComment,
  removeReaction,
  removeVerification,
  getAttestationComments,
  getAllRecommendations,
  showNodeAttestations,
  claimAttestation,
  claimEntryRequirements,
  removeClaim,
  getAttestationReactions,
  showCommunityClaims,
  getAttestationVerifications,
  validate,
} from '../../../internal.js';
import { ensureUser } from '../../../middleware/permissions.js';

import {
  getAttestationCommentsSchema,
  getAttestationReactionsSchema,
  getAttestationVerificationsSchema,
  showCommunityClaimsSchema,
  showNodeAttestationsSchema,
} from './schema.js';

const router = Router();

router.get('/suggestions/all', [ensureUser], asyncHander(getAllRecommendations));
router.get(
  '/claims/:communityId/:dpid',
  [ensureUser, validate(showCommunityClaimsSchema)],
  asyncHander(showCommunityClaims),
);

router.get('/:dpid', [validate(showNodeAttestationsSchema)], asyncHander(showNodeAttestations));
router.get('/:claimId/reactions', [validate(getAttestationReactionsSchema)], asyncHander(getAttestationReactions));
router.get(
  '/:claimId/verifications',
  [validate(getAttestationVerificationsSchema)],
  asyncHander(getAttestationVerifications),
);
router.get(
  '/:attestationId/version/:attestationVersionId',
  [validate(getAttestationCommentsSchema)],
  asyncHander(getAttestationComments),
);
router.get(
  '/:attestationId/version/:attestationVersionId/comments',
  [validate(getAttestationCommentsSchema)],
  getAttestationComments,
);

router.post('/claim', [ensureUser], asyncHander(claimAttestation));
router.post('/unclaim', [ensureUser], asyncHander(removeClaim));
router.post('/claimAll', [ensureUser], asyncHander(claimEntryRequirements));

router.post('/comment', [ensureUser], addComment);
router.post('/reaction', [ensureUser], asyncHander(addReaction));
router.post('/verification', [ensureUser], asyncHander(addVerification));

router.delete('/comment', [ensureUser], removeComment);
router.delete('/reaction', [ensureUser], asyncHander(removeReaction));
router.delete('/verification', [ensureUser], asyncHander(removeVerification));

export default router;
