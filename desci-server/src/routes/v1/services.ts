import { Router } from 'express';

import { orcidQuery } from 'controllers/proxy/orcidQuery';

const router = Router();

router.get('/orcid/profile/:orcidId/:refresh?', [], orcidQuery);

export default router;
