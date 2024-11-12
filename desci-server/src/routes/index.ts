import { Router } from 'express';

import { handleCrossrefNotificationCallback } from '../controllers/doi/mint.js';
import { resolve } from '../controllers/raw/resolve.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import page404 from './pages/404.js';
import pageRoot from './pages/root.js';
import { ensureCrossrefNotifier, identifyEndpoint } from './v1/crossref.js';
import v1 from './v1/index.js';

const router = Router();

router.use(`/v1`, v1);

router.get('/:query*', resolve);

router.use(pageRoot);
router.use(page404);

export default router;
