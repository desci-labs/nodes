import { S3Client } from '@aws-sdk/client-s3';
import { Router } from 'express';
import multer = require('multer');
import multerS3 from 'multer-s3';

import { pubTree, retrieveTree, deleteData, update, renameData } from 'controllers/data';
import { diffData } from 'controllers/data/diff';
import { moveData } from 'controllers/data/move';
import { updateExternalCid } from 'controllers/data/updateExternalCid';
import { ensureUser } from 'middleware/ensureUser';

export const s3 = new S3Client();

const router = Router();
const upload = multer({ preservePath: true, storage: multerS3({ s3, bucket: process.env.AWS_S3_BUCKET_NAME }) });

router.post('/update', [ensureUser, upload.array('files')], update);
router.post('/updateExternalCid', [ensureUser], updateExternalCid);
router.post('/delete', [ensureUser], deleteData);
router.post('/rename', [ensureUser], renameData);
router.post('/move', [ensureUser], moveData);
router.get('/retrieveTree/:nodeUuid/:manifestCid', [ensureUser], retrieveTree);
router.get('/retrieveTree/:nodeUuid/:manifestCid/:shareId?', retrieveTree);
router.get('/pubTree/:nodeUuid/:manifestCid/:rootCid?', pubTree);
// router.get('/downloadDataset/:nodeUuid/:cid', [ensureUser], downloadDataset);
router.get('/diff/:nodeUuid/:manifestCidA/:manifestCidB', diffData);

// must be last
// router.get('/*', [ensureUser], list);

export default router;
