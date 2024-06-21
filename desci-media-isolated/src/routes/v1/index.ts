import { Router } from 'express';
import thumbnails from './thumbnails.js';
import pdf from './pdf.js';

const router = Router();

router.use('/thumbnails', thumbnails);
router.use('/pdf', pdf);

export default router;
