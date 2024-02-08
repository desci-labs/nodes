import { Router } from 'express';

// import { addComment } from '../../../controllers/attestations/addComment.js';
// import { addReaction } from '../../../controllers/attestations/addReaction.js';
// import { addVerification } from '../../../controllers/attestations/addVerification.js';
// import { getAttestationComments } from '../../../controllers/attestations/getComments.js';

// import { removeComment } from '../../../controllers/attestations/removeComment.js';
// import { removeReaction } from '../../../controllers/attestations/removeReaction.js';
// import { removeVerification } from '../../../controllers/attestations/removeVerification.js';
// import { showNodeAttestations } from '../../../controllers/attestations/show.js';
// import {  } from '../../../controllers/attestations/claims.js';
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
// TODO: API To list all attestations (suggested attestations) and their engagement metrics
router.get('/suggestions', [ensureUser], asyncHander(getAllRecommendations));
// TODO: API To list all attestations within a community and their engagement metrics (suggested attestations)
router.get('/suggestions/:communityId', [ensureUser], asyncHander(getCommunityRecommendations));
// TODO: API To list all attestations claimed by a node
router.get('/:dpid', [ensureUser], asyncHander(showNodeAttestations));
// TODO: API To claim attestations
router.get('/claim', [ensureUser], asyncHander(claimAttestation));
// TODO: API To claim all attestations selected by a community
router.get('/claimAll/:communityId', [ensureUser], asyncHander(claimEntryRequirements));
// TODO: API To unclaim an attestation
router.get('/claim', [ensureUser], asyncHander(removeClaim));

router.get('/:attestationId/version/:attestationVersionId', [], getAttestationComments);
router.get('/:attestationId/version/:attestationVersionId/comments', [], getAttestationComments);

router.post('/comment', [ensureUser], addComment);
router.post('/reaction', [ensureUser], addReaction);
router.post('/verification', [ensureUser], addVerification);

router.delete('/comment', [ensureUser], removeComment);
router.delete('/reaction', [ensureUser], removeReaction);
router.delete('/verification', [ensureUser], removeVerification);

export default router;
