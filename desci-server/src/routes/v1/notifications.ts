import { Router } from 'express';

import { listUserNotifications } from '../../controllers/notifications/index.js';
import { ensureUser } from '../../internal.js';

const router = Router();

router.get('/', [ensureUser], listUserNotifications);
// router.post('/',[ensureUser], createUserNotification);
// router.patch('/',[ensureUser], updateUserNotification);

export default router;
