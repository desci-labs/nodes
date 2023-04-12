import { Router } from 'express';
import multer = require('multer');

import { downloadDataset, pubTree, retrieveTree, uploadDataset } from 'controllers/datasets';
import { deleteDataset } from 'controllers/datasets/delete';
import { update } from 'controllers/datasets/update';
import { ensureUser } from 'middleware/ensureUser';
import { upgradeManifestTransformer } from 'middleware/upgradeManifest';

const router = Router();
const upload = multer({ preservePath: true });

router.post('/upload', [ensureUser, upload.array('files'), upgradeManifestTransformer], uploadDataset);
router.post('/update', [ensureUser, upload.array('files'), upgradeManifestTransformer], update);
// router.post('/delete', [ensureUser], deleteDataset);

router.get('/retrieveTree/:nodeUuid/:cid', [ensureUser], retrieveTree);
router.get('/retrieveTree/:nodeUuid/:cid/:shareId', retrieveTree);
router.get('/pubTree/:nodeUuid/:cid', pubTree);
router.get('/downloadDataset/:nodeUuid/:cid', [ensureUser], downloadDataset);

// must be last
// router.get('/*', [ensureUser], list);

export default router;
