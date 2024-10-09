import { Router } from 'express';

import { createNotification } from '../../controllers/notifications/create.js';
import { listUserNotifications } from '../../controllers/notifications/index.js';
import { updateNotification } from '../../controllers/notifications/update.js';
import { updateSettings } from '../../controllers/notifications/updateSettings.js';
import { ensureUser } from '../../internal.js';

const router = Router();

router.get('/', [ensureUser], listUserNotifications);
router.post('/', [ensureUser], createNotification);
router.patch('/:notificationId', [ensureUser], updateNotification);
router.patch('/settings', [ensureUser], updateSettings);

export default router;
