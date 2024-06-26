import { Router } from 'express';
import { generateThumbnail } from '../../controllers/thumbnails/create.js';
import { uploadHandler } from '../../middleware/uploadHandler.js';

const router = Router();

router.post('/', uploadHandler, generateThumbnail);

export default router;
