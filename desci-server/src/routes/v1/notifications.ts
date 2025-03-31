import { Router } from 'express';

import { createNotification } from '../../controllers/notifications/create.js';
import { listUserNotifications } from '../../controllers/notifications/index.js';
import { getNotificationCount, resetNotificationCount } from '../../controllers/notifications/notificationCount.js';
import { updateNotification } from '../../controllers/notifications/update.js';
import { updateSettings } from '../../controllers/notifications/updateSettings.js';
import { ensureGuestOrUser, ensureUser } from '../../middleware/permissions.js';

const router = Router();

router.get('/', [ensureGuestOrUser], listUserNotifications);
router.get('/unseen', [ensureGuestOrUser], getNotificationCount);
router.post('/', [ensureUser], createNotification);
router.patch('/', [ensureGuestOrUser], updateNotification); // Batch update route
router.patch('/settings', [ensureGuestOrUser], updateSettings);
router.patch('/unseen', [ensureGuestOrUser], resetNotificationCount);
router.patch('/:notificationId', [ensureGuestOrUser], updateNotification);

export default router;
