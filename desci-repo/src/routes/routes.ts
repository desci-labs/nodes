import { Router } from 'express';

import page404 from './pages/404.js';
import pageRoot from './pages/root.js';
import v1 from './v1/v1.js';

const router = Router();

router.use(`/v1`, v1);

router.use(pageRoot);
router.use(page404);

export default router;
