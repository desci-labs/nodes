import { Router } from 'express';

import { versions } from '../../controllers/raw/versions.js';

const router = Router();

router.get('/versions/:uuid', versions);

export default router;
