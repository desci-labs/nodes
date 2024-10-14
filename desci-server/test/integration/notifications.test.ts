import 'mocha';
import { NotificationType, User, UserNotifications } from '@prisma/client';
import { expect } from 'chai';

import { prisma } from '../../src/client.js';
import {
  createUserNotification,
  getUserNotifications,
  updateUserNotification,
  batchUpdateUserNotifications,
  updateNotificationSettings,
  getNotificationSettings,
} from '../../src/services/NotificationService.js';
import { expectThrowsAsync } from '../util.js';

describe('Notification Service', () => {
  let user: User;

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "UserNotifications" CASCADE;`;
    user = await prisma.user.create({
      data: {
        email: 'test@example.com',
      },
    });
  });

  describe('createUserNotification', () => {
    it('should create a notification for a user', async () => {
      const notification = await createUserNotification({
        userId: user.id,
        type: NotificationType.PUBLISH,
        title: 'Test Notification',
        message: 'This is a test notification',
      });

      expect(notification.userId).to.equal(user.id);
      expect(notification.type).to.equal(NotificationType.PUBLISH);
      expect(notification.title).to.equal('Test Notification');
      expect(notification.message).to.equal('This is a test notification');
    });

    it('should throw an error when creating a notification for a disabled type', async () => {
      await updateNotificationSettings(user.id, { [NotificationType.PUBLISH]: false });

      await expectThrowsAsync(
        () =>
          createUserNotification({
            userId: user.id,
            type: NotificationType.PUBLISH,
            title: 'Test Notification',
            message: 'This is a test notification',
          }),
        'Notification type is disabled for this user',
      );
    });
  });

  describe('getUserNotifications', () => {
    it('should retrieve user notifications with pagination', async () => {
      for (let i = 0; i < 30; i++) {
        await createUserNotification({
          userId: user.id,
          type: NotificationType.PUBLISH,
          title: `Notification ${i}`,
          message: `This is notification ${i}`,
        });
      }

      const result = await getUserNotifications(user.id, { page: 1, perPage: 10 });

      expect(result.data.length).to.equal(10);
      expect(result.pagination.currentPage).to.equal(1);
      expect(result.pagination.totalPages).to.equal(2);
      expect(result.pagination.totalItems).to.equal(30);
    });
  });

  describe('updateUserNotification', () => {
    it('should update a single notification', async () => {
      const notification = await createUserNotification({
        userId: user.id,
        type: NotificationType.PUBLISH,
        title: 'Test Notification',
        message: 'This is a test notification',
      });

      const updatedNotification = await updateUserNotification(notification.id, user.id, { dismissed: true });

      expect(updatedNotification.dismissed).to.be.true;
    });

    it('should throw an error when updating a non-existent notification', async () => {
      await expectThrowsAsync(
        () => updateUserNotification(999, user.id, { dismissed: true }),
        'Notification not found',
      );
    });
  });

  describe('batchUpdateUserNotifications', () => {
    it('should update multiple notifications', async () => {
      const notifications = await Promise.all([
        createUserNotification({
          userId: user.id,
          type: NotificationType.PUBLISH,
          title: 'Notification 1',
          message: 'This is notification 1',
        }),
        createUserNotification({
          userId: user.id,
          type: NotificationType.PUBLISH,
          title: 'Notification 2',
          message: 'This is notification 2',
        }),
      ]);

      const updatedCount = await batchUpdateUserNotifications(
        notifications.map((n) => n.id),
        user.id,
        { dismissed: true },
      );

      expect(updatedCount).to.equal(2);

      const updatedNotifications = await prisma.userNotifications.findMany({
        where: { id: { in: notifications.map((n) => n.id) } },
      });

      expect(updatedNotifications.every((n) => n.dismissed)).to.be.true;
    });
  });

  describe('updateNotificationSettings', () => {
    it('should update user notification settings', async () => {
      const updatedUser = await updateNotificationSettings(user.id, {
        [NotificationType.PUBLISH]: false,
      });

      const settings = updatedUser.notificationSettings as Partial<Record<NotificationType, boolean>>;
      expect(settings[NotificationType.PUBLISH]).to.be.false;
    });
  });

  describe('getNotificationSettings', () => {
    it('should retrieve user notification settings', async () => {
      await updateNotificationSettings(user.id, {
        [NotificationType.PUBLISH]: false,
      });

      const settings = await getNotificationSettings(user.id);

      expect(settings[NotificationType.PUBLISH]).to.be.false;
    });

    it('should return an empty object for users without settings', async () => {
      const settings = await getNotificationSettings(user.id);

      expect(settings).to.deep.equal({});
    });
  });
});
