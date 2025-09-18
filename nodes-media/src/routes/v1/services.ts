import { Router } from 'express';

import { generateShareImagePuppeteer } from '../../controllers/services/shareImagePuppeteer.js';
import { getQuestion } from '../../controllers/services/getQuestion.js';
import { buildAndExportMystRepo } from '../../controllers/services/buildAndExportsJournalFiles.js';

const router = Router();

// Share image generation endpoint - using Puppeteer with SVG fallback
router.get('/generate-share-image', [], generateShareImagePuppeteer);

// Get question text for a search ID
router.get('/get-question', [], getQuestion);

router.post('/process-journal-submission', [], buildAndExportMystRepo);

export default router;
