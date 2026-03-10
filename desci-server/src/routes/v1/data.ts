import { Router } from 'express';

import { centralizedTree } from '../../controllers/data/centralizedTree.js';
import { diffData } from '../../controllers/data/diff.js';
import { downloadCentralized } from '../../controllers/data/downloadCentralized.js';
import { downloadCentralizedZip } from '../../controllers/data/downloadCentralizedZip.js';
import { googleImport } from '../../controllers/data/google/import.js';
import { pubTree, retrieveTree, deleteData, update, renameData } from '../../controllers/data/index.js';
import { moveData } from '../../controllers/data/move.js';
import { updateExternalCid } from '../../controllers/data/updateExternalCid.js';
import { uploadCentralized, centralizedUploadHandler } from '../../controllers/data/uploadCentralized.js';
import { attachUser } from '../../middleware/attachUser.js';
import { ensureNodeAccess } from '../../middleware/authorisation.js';
import { ensureGuestOrUser, ensureUser } from '../../middleware/permissions.js';
import { wrappedHandler } from '../../middleware/uploadHandler.js';

const router = Router();

router.post('/update', [ensureGuestOrUser, wrappedHandler, ensureNodeAccess], update);
router.post('/updateExternalCid', [ensureGuestOrUser, ensureNodeAccess], updateExternalCid);
router.post('/delete', [ensureGuestOrUser, ensureNodeAccess], deleteData);
router.post('/rename', [ensureGuestOrUser, ensureNodeAccess], renameData);
router.post('/move', [ensureGuestOrUser, ensureNodeAccess], moveData);
router.get('/retrieveTree/:nodeUuid/:manifestCid', [ensureGuestOrUser], retrieveTree);
router.get('/retrieveTree/:nodeUuid/:manifestCid/:shareId?', retrieveTree);
router.get('/pubTree/:nodeUuid/:manifestCid/:rootCid?', pubTree);
router.get('/diff/:nodeUuid/:manifestCidA/:manifestCidB?', [attachUser], diffData);

router.post('/google/import', [ensureUser, ensureNodeAccess], googleImport);

// Centralized data (R2) routes
router.post('/uploadCentralized', [ensureUser, centralizedUploadHandler, ensureNodeAccess], uploadCentralized);
router.get('/centralizedTree/:nodeUuid', centralizedTree);
router.get('/downloadCentralized/:nodeUuid/zip', [attachUser], downloadCentralizedZip);
router.get('/downloadCentralized/:nodeUuid/*', [attachUser], downloadCentralized);

export default router;
