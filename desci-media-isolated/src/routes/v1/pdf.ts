import { Router } from 'express';
import { generatePdfCover } from '../../controllers/pdf/createCover.js';
import { generatePreview } from '../../controllers/pdf/preview.js';

const router = Router();

router.post('/addCover', generatePdfCover);
router.post('/previews', generatePreview);

export default router;
