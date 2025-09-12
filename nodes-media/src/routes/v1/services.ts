import { Router } from 'express';

import { generateShareImagePuppeteer } from '../../controllers/services/shareImagePuppeteer.js';

const router = Router();

// Share image generation endpoint - using Puppeteer with SVG fallback
router.get('/generate-share-image', [], generateShareImagePuppeteer);

export default router;