import { Router } from 'express';

import { getUserNotifications } from '../../controllers/notifications/index.js';
import { ensureUser } from '../../internal.js';

const router = Router();

router.get('/', [ensureUser], getUserNotifications);
// router.post('/',[ensureUser], createUserNotification);
// router.patch('/',[ensureUser], updateUserNotification);

export default router;
