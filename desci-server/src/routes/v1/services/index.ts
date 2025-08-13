// Moved from /v1/services.ts
import { Router } from 'express';
import multer from 'multer';

import { ephemeralThumbnail } from '../../../controllers/proxy/ephemeralThumbnail.js';
import { orcidDid, orcidProfile } from '../../../controllers/proxy/orcidProfile.js';
import { logger as parentLogger } from '../../../logger.js';
import { ensureGuestOrUser, ensureUser } from '../../../middleware/permissions.js';

import ai from './ai.js';

const router = Router();

const upload = multer();

router.get('/orcid/profile/:orcidId', [], orcidProfile);
router.get('/orcid/did/:did', [], orcidDid);

const logger = parentLogger.child({ module: 'Services UploadHandler' });

const wrappedHandler = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    // debugger
    if (err) {
      if (err instanceof multer.MulterError) {
        logger.error({ err, type: 'MulterError' }, 'MulterError');
        throw err;
      } else {
        logger.error({ err }, 'Upload Handler Error encountered');
        res.status(401).send({ msg: 'unauthorized', code: '5412419' });
        return;
      }
    }
    next();
  });
};

router.post('/thumbnails/ephemeral', [ensureGuestOrUser, wrappedHandler], ephemeralThumbnail);

// AI Services
router.use('/ai', ai);

export default router;
