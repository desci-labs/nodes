import { Router } from 'express';

import { createNotification } from '../../controllers/notifications/create.js';
import { listUserNotifications } from '../../controllers/notifications/index.js';
import { getNotificationCount, resetNotificationCount } from '../../controllers/notifications/notificationCount.js';
import { updateNotification } from '../../controllers/notifications/update.js';
import { updateSettings } from '../../controllers/notifications/updateSettings.js';
import { ensureUser } from '../../middleware/permissions.js';

const router = Router();

router.get('/', [ensureUser], listUserNotifications);
router.get('/unseen', [ensureUser], getNotificationCount);
router.post('/', [ensureUser], createNotification);
router.patch('/', [ensureUser], updateNotification); // Batch update route
router.patch('/settings', [ensureUser], updateSettings);
router.patch('/unseen', [ensureUser], resetNotificationCount);
router.patch('/:notificationId', [ensureUser], updateNotification);

export default router;
