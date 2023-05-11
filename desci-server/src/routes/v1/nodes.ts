import { Router } from 'express';

import {
  acceptAuthorInvite,
  getNodeAccessRoles,
  sendAccessInvite,
  rejectAuthorInvite,
  revokeAccess,
} from 'controllers/nodes/accessRole';
import {
  show,
  draftUpdate,
  list,
  draftAddComponent,
  retrieveDoi,
  proxyPdf,
  draftCreate,
  consent,
  api,
  publish,
  createPrivateShare,
  revokePrivateShare,
  getPrivateShare,
  checkPrivateShareId,
  getCoverImage,
} from 'controllers/nodes/index';
import { retrieveTitle } from 'controllers/nodes/legacyManifestApi';
import { versionDetails } from 'controllers/nodes/versionDetails';
import { ensureUser } from 'middleware/ensureUser';
import { ensureNodeAccess, ensureNodeAdmin } from 'middleware/nodeGuard';

const router = Router();

router.post('/publish', [ensureUser, ensureNodeAdmin], publish);
router.post('/createDraft', [ensureUser], draftCreate);
router.post('/addComponentToDraft', [ensureUser, ensureNodeAdmin], draftAddComponent);
router.post('/updateDraft', [ensureUser, ensureNodeAdmin], draftUpdate);
router.get('/versionDetails', [], versionDetails);
router.get('/', [ensureUser], list);
router.post('/doi', [ensureUser], retrieveDoi);
router.get('/pdf', proxyPdf);
router.post('/consent', [ensureUser], consent);
router.get('/share/verify/:shareId', checkPrivateShareId);
router.get('/share/:uuid', [ensureUser, ensureNodeAccess], getPrivateShare);
router.post('/share/:uuid', [ensureUser, ensureNodeAccess], createPrivateShare);
router.post('/revokeShare/:uuid', [ensureUser, ensureNodeAccess], revokePrivateShare);
router.get('/cover/:uuid', [], getCoverImage);
router.get('/cover/:uuid/:version', [], getCoverImage);

// Node access control apis
router.get('/accessRoles', [ensureUser], getNodeAccessRoles);
router.post('/:uuid/accessInvite', [ensureUser, ensureNodeAdmin], sendAccessInvite);
router.post('/:uuid/revokeAccess', [ensureUser, ensureNodeAdmin], revokeAccess);
router.post('/accessInvite/accept', [ensureUser], acceptAuthorInvite);
router.post('/accessInvite/reject', [ensureUser], rejectAuthorInvite);
// TODO: api to list user accessRoles
// TODO: api to list node access
// TODO: Api to list node author invites

router.get('/legacy/retrieveTitle', retrieveTitle);

router.post('/api/*', [], api);

// must be last
router.get('/showPrivate/*', show);
router.get('/*', [ensureUser], show);

export default router;
