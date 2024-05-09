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
  getValidatedRecommendations,
  canVerifyClaim,
} from '../../../internal.js';
import { ensureUser } from '../../../middleware/permissions.js';

import {
  claimAttestationSchema,
  addReactionSchema,
  addVerificationSchema,
  createCommentSchema,
  deleteCommentSchema,
  deleteReactionSchema,
  deleteVerificationSchema,
  getAttestationCommentsSchema,
  getAttestationReactionsSchema,
  getAttestationVerificationsSchema,
  removeClaimSchema,
  showCommunityClaimsSchema,
  showNodeAttestationsSchema,
  claimEntryAttestationsSchema,
  canVerificationSchema,
} from './schema.js';

const router = Router();

router.get('/suggestions/all', [ensureUser], asyncHander(getAllRecommendations));
router.get('/suggestions/protected', [ensureUser], asyncHander(getValidatedRecommendations));
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
router.get('/:claimId/comments', [validate(getAttestationCommentsSchema)], asyncHander(getAttestationComments));

router.post('/claim', [ensureUser, validate(claimAttestationSchema)], asyncHander(claimAttestation));
router.post('/unclaim', [ensureUser, validate(removeClaimSchema)], asyncHander(removeClaim));
router.post('/claimAll', [ensureUser, validate(claimEntryAttestationsSchema)], asyncHander(claimEntryRequirements));

router.post('/comment', [ensureUser, validate(createCommentSchema)], asyncHander(addComment));
router.post('/reaction', [ensureUser, validate(addReactionSchema)], asyncHander(addReaction));
router.post('/verification', [ensureUser, validate(addVerificationSchema)], asyncHander(addVerification));
router.post('/verification/check/:claimId', [ensureUser, validate(canVerificationSchema)], asyncHander(canVerifyClaim));

router.delete('/comments/:commentId', [ensureUser, validate(deleteCommentSchema)], asyncHander(removeComment));
router.delete('/reactions/:reactionId', [ensureUser, validate(deleteReactionSchema)], asyncHander(removeReaction));
router.delete(
  '/verifications/:verificationId',
  [ensureUser, validate(deleteVerificationSchema)],
  asyncHander(removeVerification),
);

export default router;
