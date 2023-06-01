import { Router } from 'express';
import multer = require('multer');

import { downloadDataset, pubTree, retrieveTree, deleteData, update, renameData } from 'controllers/data';
import { moveData } from 'controllers/data/move';
import { ensureUser } from 'middleware/ensureUser';
import { ensureNodeAdmin } from 'middleware/nodeGuard';

const router = Router();
const upload = multer({ preservePath: true });

router.post('/update', [upload.array('files'), ensureNodeAdmin], update);
router.post('/delete', [ensureNodeAdmin], deleteData);
router.post('/rename', [ensureNodeAdmin], renameData);
router.post('/move', [ensureNodeAdmin], moveData);

router.get('/retrieveTree/:nodeUuid/:cid', [ensureUser], retrieveTree);
router.get('/retrieveTree/:nodeUuid/:cid/:shareId', retrieveTree);
router.get('/pubTree/:nodeUuid/:cid', pubTree);
router.get('/downloadDataset/:nodeUuid/:cid', [ensureUser], downloadDataset);

// must be last
// router.get('/*', [ensureUser], list);

export default router;
