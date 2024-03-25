import { Router } from 'express';
import { ensureApiKey } from '../../middleware/ensureApiKey.js';
import cover from '../../controllers/nodes/cover.js';

const router = Router();

router.post('/cover/:cid', [ensureApiKey], cover);

export default router;
