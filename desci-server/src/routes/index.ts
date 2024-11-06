import { Router } from 'express';

import { resolve } from '../controllers/raw/resolve.js';

import page404 from './pages/404.js';
import pageRoot from './pages/root.js';
import v1 from './v1/index.js';

const router = Router();

router.use(`/v1`, v1);

router.get('/:query*', resolve);

router.use(pageRoot);
router.use(page404);

export default router;
