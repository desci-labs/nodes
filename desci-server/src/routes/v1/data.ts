import { Router } from 'express';
import multer = require('multer');

import { downloadDataset, pubTree, retrieveTree, deleteData, update, renameData } from 'controllers/data';
import { ensureUser } from 'middleware/ensureUser';
import { ensureNodeAdmin } from 'middleware/nodeGuard';
import { upgradeManifestTransformer } from 'middleware/upgradeManifest';

const router = Router();
const upload = multer({ preservePath: true });

router.post('/update', [ensureUser, upload.array('files'), ensureNodeAdmin, upgradeManifestTransformer], update);
router.post('/delete', [ensureUser, ensureNodeAdmin], deleteData);
router.post('/rename', [ensureUser, ensureNodeAdmin], renameData);
router.get('/retrieveTree/:nodeUuid/:cid', [ensureUser], retrieveTree);
router.get('/retrieveTree/:nodeUuid/:cid/:shareId', retrieveTree);
router.get('/pubTree/:nodeUuid/:cid', pubTree);
router.get('/downloadDataset/:nodeUuid/:cid', [ensureUser], downloadDataset);

// must be last
// router.get('/*', [ensureUser], list);

export default router;
