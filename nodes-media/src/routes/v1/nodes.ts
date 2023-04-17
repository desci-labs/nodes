import { Router } from 'express';
import cover from 'controllers/nodes/cover';
import { ensureApiKey } from 'middleware/ensureApiKey';

const router = Router();

router.post('/cover/:cid', [ensureApiKey], cover);

export default router;
