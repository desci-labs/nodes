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
  getCommunityRecommendations,
  showNodeAttestations,
  claimAttestation,
  claimEntryRequirements,
  removeClaim,
} from '../../../internal.js';
import { ensureUser } from '../../../middleware/permissions.js';

const router = Router();

// router.get('/recommendations', [ensureUser], asyncHander(getAllRecommendations));
router.get('/suggestions/all', [ensureUser], asyncHander(getAllRecommendations));
router.get('/suggestions/:communityId', [ensureUser], asyncHander(getCommunityRecommendations));

router.get('/:attestationId/version/:attestationVersionId', [], asyncHander(getAttestationComments));
router.get('/:attestationId/version/:attestationVersionId/comments', [], getAttestationComments);
router.get('/:dpid', [ensureUser], asyncHander(showNodeAttestations));

router.post('/claim', [ensureUser], asyncHander(claimAttestation));
router.post('/unclaim', [ensureUser], asyncHander(removeClaim));
router.post('/claimAll/:communityId', [ensureUser], asyncHander(claimEntryRequirements));

router.post('/comment', [ensureUser], addComment);
router.post('/reaction', [ensureUser], addReaction);
router.post('/verification', [ensureUser], addVerification);

router.delete('/comment', [ensureUser], removeComment);
router.delete('/reaction', [ensureUser], removeReaction);
router.delete('/verification', [ensureUser], removeVerification);

export default router;
