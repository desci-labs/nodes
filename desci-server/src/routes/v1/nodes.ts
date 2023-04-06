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
  retrievePublishStatus,
  createPrivateShare,
  revokePrivateShare,
  getPrivateShare,
  checkPrivateShareId,
} from 'controllers/nodes/index';
import { retrieveTitle } from 'controllers/nodes/legacyManifestApi';
import { versionDetails } from 'controllers/nodes/versionDetails';
import { ensureUser } from 'middleware/ensureUser';

const router = Router();

router.post('/publish', [ensureUser], publish);
router.post('/createDraft', [ensureUser], draftCreate);
router.post('/addComponentToDraft', [ensureUser], draftAddComponent);
router.post('/updateDraft', [ensureUser], draftUpdate);
router.get('/versionDetails', [ensureUser], versionDetails);
router.get('/', [ensureUser], list);
router.post('/doi', [ensureUser], retrieveDoi);
router.get('/pdf', proxyPdf);
router.get('/publishStatus/:nodeUuid/:manifestCid', retrievePublishStatus);
router.post('/consent', [ensureUser], consent);
router.get('/share/verify/:shareId', checkPrivateShareId);
router.get('/share/:uuid', [ensureUser], getPrivateShare);
router.post('/share/:uuid', [ensureUser], createPrivateShare);
router.post('/revokeShare/:uuid', [ensureUser], revokePrivateShare);

router.get('/legacy/retrieveTitle', retrieveTitle);

router.post('/api/*', [], api);

// must be last
router.get('/showPrivate/*', show);
router.get('/*', [ensureUser], show);

export default router;
