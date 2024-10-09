import { Router } from 'express';

import { createNotification } from '../../controllers/notifications/create.js';
import { listUserNotifications } from '../../controllers/notifications/index.js';
import { updateNotification } from '../../controllers/notifications/update.js';
import { ensureUser } from '../../internal.js';

const router = Router();

router.get('/', [ensureUser], listUserNotifications);
router.post('/', [ensureUser], createNotification);
router.patch('/', [ensureUser], updateNotification);

export default router;
