import { Router } from 'express';

import { createNodeBookmark } from '../../controllers/nodes/bookmarks/create.js';
import { deleteNodeBookmark } from '../../controllers/nodes/bookmarks/delete.js';
import { listBookmarkedNodes } from '../../controllers/nodes/bookmarks/index.js';
import { nodeByDpid } from '../../controllers/nodes/byDpid.js';
import { checkIfPublishedNode } from '../../controllers/nodes/checkIfPublishedNode.js';
import { checkNodeAccess } from '../../controllers/nodes/checkNodeAccess.js';
import { addContributor } from '../../controllers/nodes/contributions/create.js';
import { deleteContributor } from '../../controllers/nodes/contributions/delete.js';
import { getNodeContributions } from '../../controllers/nodes/contributions/getNodeContributions.js';
import { getUserContributions } from '../../controllers/nodes/contributions/getUserContributions.js';
import { getUserContributionsAuthed } from '../../controllers/nodes/contributions/getUserContributionsAuthed.js';
import { emailPublishPackage } from '../../controllers/nodes/contributions/prepubEmail.js';
import { updateContributor } from '../../controllers/nodes/contributions/update.js';
import { verifyContribution } from '../../controllers/nodes/contributions/verify.js';
import { createDpid } from '../../controllers/nodes/createDpid.js';
import { dispatchDocumentChange, getNodeDocument } from '../../controllers/nodes/documents.js';
import { explore } from '../../controllers/nodes/explore.js';
import { feed } from '../../controllers/nodes/feed.js';
import { frontmatterPreview } from '../../controllers/nodes/frontmatterPreview.js';
import { getDraftNodeStats } from '../../controllers/nodes/getDraftNodeStats.js';
import { getPublishedNodes } from '../../controllers/nodes/getPublishedNodes.js';
import { getPublishedNodeStats } from '../../controllers/nodes/getPublishedNodeStats.js';
import {
  show,
  draftUpdate,
  list,
  draftAddComponent,
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
} from '../../controllers/nodes/index.js';
import { retrieveTitle } from '../../controllers/nodes/legacyManifestApi.js';
import { preparePublishPackage } from '../../controllers/nodes/preparePublishPackage.js';
import { attachUser } from '../../middleware/attachUser.js';
import { ensureNodeAccess, ensureWriteNodeAccess } from '../../middleware/authorisation.js';
import { ensureUserIfPresent } from '../../middleware/ensureUserIfPresent.js';
import { ensureUser } from '../../middleware/permissions.js';
import { validate } from '../../middleware/validator.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

import { getCommentsSchema } from './attestations/schema.js';

const router = Router();

router.post('/prepublish', [ensureUser, ensureNodeAccess], prepublish);
router.post('/publish', [ensureUser], publish);
router.get('/stats', [ensureUser], getDraftNodeStats);
router.get('/stats/published', [ensureUser], getPublishedNodeStats);
router.get('/published/list', [ensureUser], getPublishedNodes);
router.get('/published/:dpid([0-9]+)', [], nodeByDpid);
router.get('/published/:uuid', [], checkIfPublishedNode);
router.get('/access/:uuid', [ensureUserIfPresent], checkNodeAccess);
router.post('/search/:query', [ensureUser], searchNodes);
router.get('/explore', [], explore);

router.post('/createDpid', [ensureUser, ensureWriteNodeAccess], createDpid);
router.post('/createDraft', [ensureUser], draftCreate);
// is this api deprecated?
router.post('/addComponentToDraft', [ensureUser], draftAddComponent);
router.post('/updateDraft', [ensureUser], draftUpdate);
router.get('/versionDetails', [], versionDetails);
router.get('/', [ensureUser], list);
router.get('/pdf', proxyPdf);
router.post('/consent', [], consent);
router.post('/consent/publish', [ensureUser, validate(publishConsentSchema)], asyncHandler(publishConsent));
router.get(
  '/consent/publish/:uuid',
  [ensureUser, validate(checkPublishConsentSchema)],
  asyncHandler(checkUserPublishConsent),
);
router.post('/terms', [ensureUser], consent);
router.get('/share/verify/:shareId', checkPrivateShareId);
router.get('/share', [ensureUser], listSharedNodes);
router.get('/share/:uuid', [ensureUser], getPrivateShare);
router.post('/share/:uuid', [ensureUser], createPrivateShare);
router.post('/revokeShare/:uuid', [ensureUser], revokePrivateShare);
router.get('/bookmarks', [ensureUser], listBookmarkedNodes);
router.delete('/bookmarks/:nodeUuid', [ensureUser], deleteNodeBookmark);
router.post('/bookmarks', [ensureUser], createNodeBookmark);
router.get('/cover/:uuid', [], getCoverImage);
router.get('/cover/:uuid/:version', [], getCoverImage);
router.get('/documents/:uuid', [ensureUser, ensureNodeAccess], getNodeDocument);
router.post('/documents/:uuid/actions', [ensureUser, ensureNodeAccess], dispatchDocumentChange);
router.get('/thumbnails/:uuid/:manifestCid?', [attachUser], thumbnails);
router.post('/contributions/node/:uuid', [attachUser], getNodeContributions);
router.post('/contributions/:uuid', [ensureUser, ensureWriteNodeAccess], addContributor);
router.patch('/contributions/verify', [ensureUser], verifyContribution);
router.patch('/contributions/:uuid', [ensureUser, ensureWriteNodeAccess], updateContributor);
router.delete('/contributions/:uuid', [ensureUser, ensureWriteNodeAccess], deleteContributor);
router.get('/contributions/user/:userId', [], getUserContributions);
router.get('/contributions/user', [ensureUser], getUserContributionsAuthed);
router.post('/distribution', preparePublishPackage);
router.post('/distribution/preview', [ensureUser], frontmatterPreview);

// Doi api routes
router.get('/:identifier/doi', [ensureUser], asyncHandler(retrieveNodeDoi));
router.post(
  '/:uuid/automate-metadata',
  [ensureUser, ensureNodeAccess, validate(automateMetadataSchema)],
  automateMetadata,
);
router.post('/generate-metadata', [ensureUser, validate(generateMetadataSchema)], generateMetadata);
router.post('/distribution/email', [ensureUser], emailPublishPackage);

// doi automation
router.post(
  '/:uuid/automate-manuscript',
  [ensureUser, ensureNodeAccess, validate(attachDoiSchema)],
  asyncHandler(automateManuscriptDoi),
);

router.delete('/:uuid', [ensureUser], deleteNode);

router.get('/:uuid/comments', [validate(getCommentsSchema), attachUser], asyncHandler(getGeneralComments));

router.get('/feed', [], feed);

router.get('/legacy/retrieveTitle', retrieveTitle);

router.post('/api/*', [], api);

// must be last
router.get('/showPrivate/*', show);
router.get('/*', [ensureUser], show);

export default router;
