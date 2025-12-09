import { Router } from 'express';

import { generateShareImagePuppeteer } from '../../controllers/services/shareImagePuppeteer.js';
import { getQuestion } from '../../controllers/services/getQuestion.js';

const router = Router();

// Share image generation endpoint - using Puppeteer with SVG fallback
router.get('/generate-share-image', [], generateShareImagePuppeteer);

// Get question text for a search ID
router.get('/get-question', [], getQuestion);

export default router;
