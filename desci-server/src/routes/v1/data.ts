import { Router } from 'express';
import multer = require('multer');
import multerS3 from 'multer-s3';
import { v4 } from 'uuid';

import { pubTree, retrieveTree, deleteData, update, renameData } from 'controllers/data';
import { diffData } from 'controllers/data/diff';
import { moveData } from 'controllers/data/move';
import { updateExternalCid } from 'controllers/data/updateExternalCid';
import { ensureUser } from 'middleware/ensureUser';
import { ensureWriteAccess } from 'middleware/ensureWriteAccess';
import { parseFormDataFields } from 'middleware/parseFormDataFields';
import { isS3Configured, s3Client } from 'services/s3';

const router = Router();

const upload = isS3Configured
  ? multer({
      preservePath: true,
      storage: multerS3({
        s3: s3Client,
        bucket: process.env.AWS_S3_BUCKET_NAME,
        key: (req, file, cb) => {
          const userId = (req as any).user.id;
          const { uuid, contextPath } = (req as any).body;
          if (!uuid || !contextPath || !userId) {
            cb(new Error('Missing required params to form key'));
          }
          const key = `${userId}*${uuid}/${v4()}`; // adjust for dir uploads, doesn't start with '/'
          cb(null, key);
        },
      }),
    })
  : multer({ preservePath: true });

router.post('/update', [ensureUser, parseFormDataFields, ensureWriteAccess, upload.array('files')], update);
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
