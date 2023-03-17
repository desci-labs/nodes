import { Router } from 'express';
import multer = require('multer');

import { downloadDataset, pubTree, retrieveTree, uploadDataset } from 'controllers/datasets';
import { deleteDataset } from 'controllers/datasets/delete';
import { update, updateV2 } from 'controllers/datasets/update';
import { ensureUser } from 'middleware/ensureUser';

const router = Router();
const upload = multer({ preservePath: true });

router.post('/upload', [ensureUser, upload.array('files')], uploadDataset);
router.post('/update', [ensureUser, upload.array('files')], updateV2);
router.post('/delete', [ensureUser], deleteDataset);
//TODO adjust auth for both pub and priv datasets
router.get('/retrieveTree/:nodeUuid/:cid', [ensureUser], retrieveTree);
router.get('/pubTree/:nodeUuid/:cid', pubTree);
router.get('/downloadDataset/:nodeUuid/:cid', [ensureUser], downloadDataset);

// must be last
// router.get('/*', [ensureUser], list);

export default router;
