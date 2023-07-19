import { Router } from 'express';

import { orcidProfile } from 'controllers/proxy/orcidProfile';

const router = Router();

router.get('/orcid/profile/:orcidId', [], orcidProfile);

export default router;
