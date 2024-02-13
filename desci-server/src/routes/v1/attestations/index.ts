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
} from '../../../internal.js';
import { ensureUser } from '../../../middleware/permissions.js';

const router = Router();

router.get('/suggestions/all', [ensureUser], asyncHander(getAllRecommendations));
router.get('/claims/:communityId/:dpid', [ensureUser], asyncHander(showCommunityClaims));

router.get('/:dpid', [], asyncHander(showNodeAttestations));
router.get('/:claimId/reactions', [], asyncHander(getAttestationReactions));
router.get('/:claimId/verifications', [], asyncHander(getAttestationVerifications));
router.get('/:attestationId/version/:attestationVersionId', [], asyncHander(getAttestationComments));
router.get('/:attestationId/version/:attestationVersionId/comments', [], getAttestationComments);

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
