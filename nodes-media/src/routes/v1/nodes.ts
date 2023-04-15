import { Router } from 'express';
import cover from 'controllers/nodes/cover';

const router = Router();

router.post('/cover/:cid', cover);

export default router;
