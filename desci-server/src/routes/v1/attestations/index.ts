import { Router } from 'express';

import { claimAttestation, claimEntryRequirements, removeClaim } from '../../../controllers/attestations/claims.js';
import { addComment, getAttestationComments, removeComment } from '../../../controllers/attestations/comments.js';
import { addReaction, getAttestationReactions, removeReaction } from '../../../controllers/attestations/reactions.js';
import {
  getAllRecommendations,
  getValidatedRecommendations,
} from '../../../controllers/attestations/recommendations.js';
import { showCommunityClaims, showNodeAttestations } from '../../../controllers/attestations/show.js';
import {
  addVerification,
  getAttestationVerifications,
  removeVerification,
} from '../../../controllers/attestations/verification.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validate } from '../../../middleware/validator.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

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

router.get('/suggestions/all', [], asyncHandler(getAllRecommendations));
router.get('/suggestions/protected', [], asyncHandler(getValidatedRecommendations));
router.get(
  '/claims/:communityId/:dpid',
  [ensureUser, validate(showCommunityClaimsSchema)],
  asyncHandler(showCommunityClaims),
);

router.get('/:uuid', [validate(showNodeAttestationsSchema)], asyncHandler(showNodeAttestations));
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

router.post('/comments', [ensureUser, validate(createCommentSchema)], asyncHandler(addComment));
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
