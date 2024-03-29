import { Router } from 'express';
import { generateThumbnail } from '../../controllers/thumbnails/create.js';

const router = Router();

router.post('/', generateThumbnail);

export default router;
