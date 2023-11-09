import { Router } from 'express';

import { orcidDid, orcidProfile } from 'controllers/proxy/orcidProfile';

const router = Router();

router.get('/orcid/profile/:orcidId', [], orcidProfile);
router.get('/orcid/did/:did', [], orcidDid);

export default router;
