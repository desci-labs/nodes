import { Router } from 'express';

import latex from './latex.js';
import nodes from './nodes.js';
import services from './services.js';

const router = Router();

router.use('/latex', latex);
router.use('/nodes', nodes);
router.use('/services', services);

export default router;
