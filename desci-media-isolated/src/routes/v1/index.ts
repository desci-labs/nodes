import { Router } from 'express';
import thumbnails from './thumbnails.js';

const router = Router();

router.use('/thumbnails', thumbnails);

export default router;
