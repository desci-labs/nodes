import { Router } from 'express';
import upload from '../../controllers/latex/upload.js';
import compile from '../../controllers/latex/compile.js';

const router = Router();

router.post('/upload', upload);
router.post('/compile', compile);

export default router;
