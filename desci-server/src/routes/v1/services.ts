import { Router } from 'express';
import multer from 'multer';

import { ephemeralThumbnail } from '../../controllers/proxy/ephemeralThumbnail.js';
import { orcidDid, orcidProfile } from '../../controllers/proxy/orcidProfile.js';
import { ensureUser } from '../../middleware/permissions.js';
// import { ensureUser } from '../../internal.js';

const router = Router();

const upload = multer();

router.get('/orcid/profile/:orcidId', [], orcidProfile);
router.get('/orcid/did/:did', [], orcidDid);

router.post('/thumbnails/ephemeral', [ensureUser, upload.single('file')], ephemeralThumbnail);

export default router;
