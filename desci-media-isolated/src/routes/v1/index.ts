import { Router } from 'express';
import thumbnails from './thumbnails';

const router = Router();

router.use('/thumbnails', thumbnails);

export default router;
