import { Router } from 'express';

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
  deleteNode,
} from '../../controllers/nodes/index.js';
import { retrieveTitle } from '../../controllers/nodes/legacyManifestApi.js';
import { versionDetails } from '../../controllers/nodes/versionDetails.js';
import { ensureUser } from '../../middleware/permissions.js';

const router = Router();

router.post('/publish', [ensureUser], publish);
router.post('/createDraft', [ensureUser], draftCreate);
router.post('/addComponentToDraft', [ensureUser], draftAddComponent);
router.post('/updateDraft', [ensureUser], draftUpdate);
router.get('/versionDetails', [], versionDetails);
router.get('/', [ensureUser], list);
router.post('/doi', [ensureUser], retrieveDoi);
router.get('/pdf', proxyPdf);
router.post('/consent', [], consent);
router.post('/terms', [ensureUser], consent);
router.get('/share/verify/:shareId', checkPrivateShareId);
router.get('/share/:uuid', [ensureUser], getPrivateShare);
router.post('/share/:uuid', [ensureUser], createPrivateShare);
router.post('/revokeShare/:uuid', [ensureUser], revokePrivateShare);
router.get('/cover/:uuid', [], getCoverImage);
router.get('/cover/:uuid/:version', [], getCoverImage);

router.delete('/:uuid', [ensureUser], deleteNode);

router.get('/legacy/retrieveTitle', retrieveTitle);

router.post('/api/*', [], api);

// must be last
router.get('/showPrivate/*', show);
router.get('/*', [ensureUser], show);

export default router;
