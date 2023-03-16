import { Router } from 'express';

import { versions } from 'controllers/raw';

const router = Router();

router.get('/versions/:uuid', versions);

export default router;
