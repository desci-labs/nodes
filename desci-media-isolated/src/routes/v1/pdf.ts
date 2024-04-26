import { Router } from 'express';
import { generatePdfCover } from '../../controllers/pdf/createCover.js';

const router = Router();

router.post('/addCover', generatePdfCover);

export default router;
