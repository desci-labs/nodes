import { Router } from 'express';

import { showNodeAttestations } from '../../controllers/attestations/show.js';
import { createNodeBookmark } from '../../controllers/nodes/bookmarks/create.js';
import { deleteNodeBookmark } from '../../controllers/nodes/bookmarks/delete.js';
import { listBookmarkedNodes } from '../../controllers/nodes/bookmarks/index.js';
import { nodeByDpid } from '../../controllers/nodes/byDpid.js';
import { nodeByStream } from '../../controllers/nodes/byStream.js';
import { checkIfPublishedNode } from '../../controllers/nodes/checkIfPublishedNode.js';
import { checkNodeAccess } from '../../controllers/nodes/checkNodeAccess.js';
import { addContributor } from '../../controllers/nodes/contributions/create.js';
import { deleteContributor } from '../../controllers/nodes/contributions/delete.js';
import { denyContribution } from '../../controllers/nodes/contributions/deny.js';
import { getNodeContributions } from '../../controllers/nodes/contributions/getNodeContributions.js';
import { getUserContributions } from '../../controllers/nodes/contributions/getUserContributions.js';
import { getUserContributionsAuthed } from '../../controllers/nodes/contributions/getUserContributionsAuthed.js';
import { emailPublishPackage } from '../../controllers/nodes/contributions/prepubEmail.js';
import { updateContributor } from '../../controllers/nodes/contributions/update.js';
import { verifyContribution } from '../../controllers/nodes/contributions/verify.js';
import { createDpid } from '../../controllers/nodes/createDpid.js';
import { dispatchDocumentChange, getNodeDocument } from '../../controllers/nodes/documents.js';
import { explore } from '../../controllers/nodes/explore.js';
import {
  addExternalPublication,
  addExternalPublicationsSchema,
  externalPublications,
  externalPublicationsSchema,
  verifyExternalPublication,
  verifyExternalPublicationSchema,
} from '../../controllers/nodes/externalPublications.js';
import { feed } from '../../controllers/nodes/feed.js';
import { frontmatterPreview } from '../../controllers/nodes/frontmatterPreview.js';
import { getDraftNodeStats } from '../../controllers/nodes/getDraftNodeStats.js';
import { getPublishedNodes } from '../../controllers/nodes/getPublishedNodes.js';
import { getPublishedNodeStats } from '../../controllers/nodes/getPublishedNodeStats.js';
import {
  show,
  draftUpdate,
  list,
  proxyPdf,
  draftCreate,
  consent,
  api,
  publish,
  checkPrivateShareId,
  createPrivateShare,
  revokePrivateShare,
  getPrivateShare,
  getCoverImage,
  deleteNode,
  publishConsentSchema,
  publishConsent,
  checkUserPublishConsent,
  checkPublishConsentSchema,
  automateMetadata,
  generateMetadata,
  automateMetadataSchema,
  generateMetadataSchema,
  automateManuscriptDoi,
  attachDoiSchema,
  retrieveNodeDoi,
  prepublish,
  getGeneralComments,
  listSharedNodes,
  searchNodes,
  versionDetails,
  thumbnails,
  upvoteComment,
  getUserVote,
  deleteUserVote,
  downvoteComment,
  editComment,
} from '../../controllers/nodes/index.js';
import { retrieveTitle } from '../../controllers/nodes/legacyManifestApi.js';
import {
  deleteNodeLIke,
  getNodeLikes,
  likeNodeSchema,
  postNodeLike,
  unlikeNodeSchema,
} from '../../controllers/nodes/likes.js';
import { preparePublishPackage } from '../../controllers/nodes/preparePublishPackage.js';
import { attachUser } from '../../middleware/attachUser.js';
import {
  ensureNodeAccess,
  ensureNodeExists,
  ensureWriteNodeAccess,
  attachNode,
} from '../../middleware/authorisation.js';
import { ensureGuestOrUser, ensureUser } from '../../middleware/permissions.js';
import { validate } from '../../middleware/validator.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

import {
  editCommentsSchema,
  getCommentsSchema,
  postCommentVoteSchema,
  showNodeAttestationsSchema,
} from './attestations/schema.js';

const router = Router();

router.post('/prepublish', [ensureUser, ensureNodeAccess], prepublish);
router.post('/publish', [ensureUser], publish);
router.get('/stats', [ensureUser], getDraftNodeStats);
router.get('/stats/published', [ensureUser], getPublishedNodeStats);
router.get('/published/list', [ensureUser], getPublishedNodes);
router.get('/published/:dpid([0-9]+)', [], nodeByDpid);
router.get('/published/:stream([a-z0-9]{50,})', [], nodeByStream);
router.get('/published/:uuid', [], checkIfPublishedNode);
router.get('/access/:uuid', [attachUser], checkNodeAccess);
router.post('/search/:query', [ensureGuestOrUser], searchNodes);
router.get('/explore', [], explore);

router.post('/createDpid', [ensureUser, ensureWriteNodeAccess], createDpid);
router.post('/createDraft', [ensureGuestOrUser], draftCreate);

router.post('/updateDraft', [ensureGuestOrUser], draftUpdate);
router.get('/versionDetails', [], versionDetails);
router.get('/', [ensureGuestOrUser], list);
router.get('/pdf', proxyPdf);
router.post('/consent', [], consent);
router.post('/consent/publish', [ensureUser, validate(publishConsentSchema)], asyncHandler(publishConsent));
router.get(
  '/consent/publish/:uuid',
  [ensureUser, validate(checkPublishConsentSchema)],
  asyncHandler(checkUserPublishConsent),
);
router.post('/terms', [ensureGuestOrUser], consent);

// Share
router.get('/share/verify/:shareId', checkPrivateShareId);
router.get('/share', [ensureGuestOrUser], listSharedNodes);
router.get('/share/:uuid', [ensureGuestOrUser], getPrivateShare);
router.post('/share/:uuid', [ensureGuestOrUser], createPrivateShare);
router.post('/revokeShare/:uuid', [ensureGuestOrUser], revokePrivateShare);

// Bookmarks
router.get('/bookmarks', [ensureGuestOrUser], listBookmarkedNodes);
router.delete('/bookmarks/:type/:bId', [ensureGuestOrUser], deleteNodeBookmark);
router.delete('/bookmarks/:type/:bId/*', [ensureGuestOrUser], deleteNodeBookmark);
router.post('/bookmarks', [ensureGuestOrUser], createNodeBookmark);

// Cover
router.get('/cover/:uuid', [], getCoverImage);
router.get('/cover/:uuid/:version', [], getCoverImage);

router.get('/documents/:uuid', [ensureGuestOrUser, ensureNodeAccess], getNodeDocument);
router.post('/documents/:uuid/actions', [ensureGuestOrUser, ensureNodeAccess], dispatchDocumentChange);
router.get('/thumbnails/:uuid/:manifestCid?', [attachUser], thumbnails);

// Contributions
router.post('/contributions/node/:uuid', [attachUser], getNodeContributions);
router.post('/contributions/:uuid', [ensureGuestOrUser, ensureWriteNodeAccess], addContributor);
router.patch('/contributions/verify', [ensureUser], verifyContribution);
router.patch('/contributions/deny', [ensureUser], denyContribution);
router.patch('/contributions/:uuid', [ensureGuestOrUser, ensureWriteNodeAccess], updateContributor);
router.delete('/contributions/:uuid', [ensureGuestOrUser, ensureWriteNodeAccess], deleteContributor);
router.get('/contributions/user/:userId', [], getUserContributions);
router.get('/contributions/user', [ensureGuestOrUser], getUserContributionsAuthed);

// Prepub (distribution pkg)
router.post('/distribution', [ensureUser], preparePublishPackage);
router.post('/distribution/preview', [ensureUser], frontmatterPreview);
router.post('/distribution/email', [ensureUser], emailPublishPackage);

// Doi api routes
router.get('/:identifier/doi', [], asyncHandler(retrieveNodeDoi));
router.post(
  '/:uuid/automate-metadata',
  [ensureGuestOrUser, ensureNodeAccess, validate(automateMetadataSchema)],
  automateMetadata,
);
router.post('/generate-metadata', [ensureGuestOrUser, validate(generateMetadataSchema)], generateMetadata);

// doi automation
router.post(
  '/:uuid/automate-manuscript',
  [ensureGuestOrUser, ensureNodeAccess, validate(attachDoiSchema)],
  asyncHandler(automateManuscriptDoi),
);

router.delete('/:uuid', [ensureGuestOrUser], deleteNode);

router.get(
  '/:uuid/external-publications',
  [validate(externalPublicationsSchema), attachUser],
  asyncHandler(externalPublications),
);
router.post(
  '/:uuid/external-publications',
  [validate(addExternalPublicationsSchema), ensureGuestOrUser, ensureNodeAccess],
  asyncHandler(addExternalPublication),
);
router.post(
  '/:uuid/verify-publication',
  [validate(verifyExternalPublicationSchema), ensureGuestOrUser, ensureNodeAccess],
  asyncHandler(verifyExternalPublication),
);

router.get('/:uuid/comments', [attachUser, validate(getCommentsSchema)], asyncHandler(getGeneralComments));
router.get(
  '/:uuid/comments/:commentId/vote',
  [ensureGuestOrUser, validate(postCommentVoteSchema)],
  asyncHandler(getUserVote),
);
router.post(
  '/:uuid/comments/:commentId/upvote',
  [ensureUser, validate(postCommentVoteSchema)],
  asyncHandler(upvoteComment),
);
router.put(
  '/:uuid/comments/:id',
  [ensureUser, ensureNodeAccess, validate(editCommentsSchema)],
  asyncHandler(editComment),
);
router.post(
  '/:uuid/comments/:commentId/downvote',
  [ensureUser, validate(postCommentVoteSchema)],
  asyncHandler(downvoteComment),
);
router.delete(
  '/:uuid/comments/:commentId/vote',
  [ensureUser, validate(postCommentVoteSchema)],
  asyncHandler(deleteUserVote),
);

router.get('/:uuid/attestations', [validate(showNodeAttestationsSchema)], asyncHandler(showNodeAttestations));

router.get('/:uuid/likes', [attachUser, attachNode, validate(likeNodeSchema)], asyncHandler(getNodeLikes));
router.post('/:uuid/likes', [ensureUser, ensureNodeExists, validate(likeNodeSchema)], asyncHandler(postNodeLike));
router.delete('/:uuid/likes', [ensureUser, ensureNodeExists, validate(unlikeNodeSchema)], asyncHandler(deleteNodeLIke));

router.get('/feed', [], feed);

router.get('/legacy/retrieveTitle', retrieveTitle);

router.post('/api/*', [], api);

// must be last
router.get('/showPrivate/*', show);
router.get('/*', [ensureGuestOrUser], show);

export default router;
