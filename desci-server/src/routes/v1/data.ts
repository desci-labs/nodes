import { Router } from 'express';
import multer = require('multer');

import { downloadDataset, pubTree, retrieveTree, deleteData, update, renameData } from 'controllers/data';
import { moveData } from 'controllers/data/move';
import { ensureUser } from 'middleware/ensureUser';
import { upgradeManifestTransformer } from 'middleware/upgradeManifest';

const router = Router();
const upload = multer({ preservePath: true });

router.post('/update', [ensureUser, upload.array('files')], update);
router.post('/delete', [ensureUser], deleteData);
router.post('/rename', [ensureUser], renameData);
router.post('/move', [ensureUser], moveData);
router.get('/retrieveTree/:nodeUuid/:cid', [ensureUser], retrieveTree);
router.get('/retrieveTree/:nodeUuid/:cid/:shareId', retrieveTree);
router.get('/pubTree/:nodeUuid/:cid', pubTree);
router.get('/downloadDataset/:nodeUuid/:cid', [ensureUser], downloadDataset);

// must be last
// router.get('/*', [ensureUser], list);

export default router;
