import { Router } from 'express';

import latex from './latex.js';
import nodes from './nodes.js';

const router = Router();

router.use('/latex', latex);
router.use('/nodes', nodes);

export default router;
