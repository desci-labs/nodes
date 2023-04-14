import { Router } from 'express';
import cover from 'controllers/nodes/cover';

const router = Router();

router.get('/cover/:cid', cover);

export default router;
