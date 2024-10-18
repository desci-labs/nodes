import { Router } from 'express';

import { resolve } from '../controllers/raw/resolve.js';
// import { asyncHandler, handleCrossrefNotificationCallback } from '../internal.js';

import page404 from './pages/404.js';
import pageRoot from './pages/root.js';
import { ensureCrossrefNotifier, identifyEndpoint } from './v1/crossref.js';
import v1 from './v1/index.js';

const router = Router();

router.use(`/v1`, v1);

// potential notification fallback catch
router.post(
  '/crossref/callback',
  [identifyEndpoint('/crossref/callback'), ensureCrossrefNotifier],
  asyncHandler(handleCrossrefNotificationCallback),
);
router.post(
  '/crossref/callback/v1/crossref/callback',
  [identifyEndpoint('/crossref/callback/v1/crossref/callback'), ensureCrossrefNotifier],
  asyncHandler(handleCrossrefNotificationCallback),
);

router.get('/:query*', resolve);

router.use(pageRoot);
router.use(page404);

export default router;
