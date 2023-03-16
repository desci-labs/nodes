import { Router } from 'express';

import latex from './latex';

const router = Router();

router.use('/latex', latex);

export default router;
