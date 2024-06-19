import { Router } from 'express';

import {
  asyncHandler,
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
} from './schema.js';

const router = Router();

router.get('/suggestions/all', [ensureUser], asyncHandler(getAllRecommendations));
router.get('/suggestions/protected', [ensureUser], asyncHandler(getValidatedRecommendations));
router.get(
  '/claims/:communityId/:dpid',
  [ensureUser, validate(showCommunityClaimsSchema)],
  asyncHandler(showCommunityClaims),
);

router.get('/:dpid', [validate(showNodeAttestationsSchema)], asyncHandler(showNodeAttestations));
router.get('/:claimId/reactions', [validate(getAttestationReactionsSchema)], asyncHandler(getAttestationReactions));
router.get(
  '/:claimId/verifications',
  [validate(getAttestationVerificationsSchema)],
  asyncHandler(getAttestationVerifications),
);
router.get('/:claimId/comments', [validate(getAttestationCommentsSchema)], asyncHandler(getAttestationComments));

router.post('/claim', [ensureUser, validate(claimAttestationSchema)], asyncHandler(claimAttestation));
router.post('/unclaim', [ensureUser, validate(removeClaimSchema)], asyncHandler(removeClaim));
router.post('/claimAll', [ensureUser, validate(claimEntryAttestationsSchema)], asyncHandler(claimEntryRequirements));

router.post('/comment', [ensureUser, validate(createCommentSchema)], asyncHandler(addComment));
router.post('/reaction', [ensureUser, validate(addReactionSchema)], asyncHandler(addReaction));
router.post('/verification', [ensureUser, validate(addVerificationSchema)], asyncHandler(addVerification));

router.delete('/comments/:commentId', [ensureUser, validate(deleteCommentSchema)], asyncHandler(removeComment));
router.delete('/reactions/:reactionId', [ensureUser, validate(deleteReactionSchema)], asyncHandler(removeReaction));
router.delete(
  '/verifications/:verificationId',
  [ensureUser, validate(deleteVerificationSchema)],
  asyncHandler(removeVerification),
);

export default router;
