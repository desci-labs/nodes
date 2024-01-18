import { Router } from 'express';
import multer = require('multer');
import multerS3 from 'multer-s3';
import { v4 } from 'uuid';

import { diffData } from '../../controllers/data/diff.js';
import { pubTree, retrieveTree, deleteData, update, renameData } from '../../controllers/data/index.js';
import { moveData } from '../../controllers/data/move.js';
import { updateExternalCid } from '../../controllers/data/updateExternalCid.js';
import { logger } from '../../logger.js';
import { ensureNodeAccess, ensureWriteAccessCheck } from '../../middleware/authorisation.js';
import { attachUser } from '../../middleware/ensureUser.js';
import { ensureUser } from '../../middleware/permissions.js';
import { isS3Configured, s3Client } from '../../services/s3.js';

const router = Router();

const upload = isS3Configured
  ? multer({
      fileFilter: async (req, file, cb) => {
        // Ensure write access before uploading
        if (!(req as any).node) {
          const user = (req as any).user;
          const { ok, node } = await ensureWriteAccessCheck(user, req.body.uuid);
          if (ok) {
            (req as any).node = node;
          } else {
            cb(new Error('unauthorized'));
            return;
          }
        }
        // accept the files
        cb(null, true);
      },
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

const uploadHandler = upload.array('files');

const wrappedHandler = (req, res, next) => {
  uploadHandler(req, res, (err) => {
    // debugger
    if (err) {
      if (err instanceof multer.MulterError) {
        throw err;
      } else {
        logger.error({ err }, 'Upload Handler Error encountered');
        res.status(401).send({ msg: 'unauthorized' });
        return;
      }
    }
    next();
  });
};

router.post('/update', [ensureUser, wrappedHandler, ensureNodeAccess], update);
router.post('/updateExternalCid', [ensureUser, ensureNodeAccess], updateExternalCid);
router.post('/delete', [ensureUser, ensureNodeAccess], deleteData);
router.post('/rename', [ensureUser, ensureNodeAccess], renameData);
router.post('/move', [ensureUser, ensureNodeAccess], moveData);
router.get('/retrieveTree/:nodeUuid/:manifestCid', [ensureUser], retrieveTree);
router.get('/retrieveTree/:nodeUuid/:manifestCid/:shareId?', retrieveTree);
router.get('/pubTree/:nodeUuid/:manifestCid/:rootCid?', pubTree);
// router.get('/downloadDataset/:nodeUuid/:cid', [ensureUser], downloadDataset);
router.get('/diff/:nodeUuid/:manifestCidA/:manifestCidB?', [attachUser], diffData);

// must be last
// router.get('/*', [ensureUser], list);

export default router;
