import { Router } from 'express';

import compile from 'controllers/latex/compile';
import upload from 'controllers/latex/upload';
const router = Router();

router.post('/upload', upload);
router.post('/compile', compile);

export default router;
