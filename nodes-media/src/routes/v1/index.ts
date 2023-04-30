import { Router } from 'express';

import latex from './latex';
import nodes from './nodes';

const router = Router();

router.use('/latex', latex);
router.use('/nodes', nodes);

export default router;
