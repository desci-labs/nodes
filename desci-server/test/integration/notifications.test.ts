import { NotificationCategory, NotificationType, User, UserNotifications } from '@prisma/client';
import { describe, it, beforeEach, expect } from 'vitest';

import { prisma } from '../../src/client.js';
import { NotificationService } from '../../src/services/Notifications/NotificationService.js';
import { expectThrowsAsync } from '../util.js';

describe.skip('Notification Service', () => {
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
      const notification = await NotificationService.createUserNotification({
        userId: user.id,
        type: NotificationType.PUBLISH,
        title: 'Test Notification',
        message: 'This is a test notification',
        category: NotificationCategory.DESCI_PUBLISH,
      });

      expect(notification?.userId).toBe(user.id);
      expect(notification?.type).toBe(NotificationType.PUBLISH);
      expect(notification?.title).toBe('Test Notification');
      expect(notification?.message).toBe('This is a test notification');
    });

    it('should throw an error when creating a notification for a disabled type', async () => {
      await NotificationService.updateNotificationSettings(user.id, { [NotificationType.PUBLISH!]: false });

      await expectThrowsAsync(
        () =>
          NotificationService.createUserNotification(
            {
              userId: user.id,
              type: NotificationType.PUBLISH,
              title: 'Test Notification',
              message: 'This is a test notification',
              category: NotificationCategory.DESCI_PUBLISH,
            },
            { throwOnDisabled: true },
          ),
        'Notification type is disabled for this user',
      );
    });
  });

  describe('getUserNotifications', () => {
    it('should retrieve user notifications with pagination', async () => {
      for (let i = 0; i < 30; i++) {
        await NotificationService.createUserNotification({
          userId: user.id,
          type: NotificationType.PUBLISH,
          title: `Notification ${i}`,
          message: `This is notification ${i}`,
          category: NotificationCategory.DESCI_PUBLISH,
        });
      }

      const result = await NotificationService.getUserNotifications(user.id, { page: 1, perPage: 10 });

      expect(result.data.length).toBe(10);
      expect(result.pagination.currentPage).toBe(1);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.totalItems).toBe(30);
    });
  });

  describe('updateUserNotification', () => {
    it('should update a single notification', async () => {
      const notification = await NotificationService.createUserNotification({
        userId: user.id,
        type: NotificationType.PUBLISH,
        title: 'Test Notification',
        message: 'This is a test notification',
        category: NotificationCategory.DESCI_PUBLISH,
      });

      const updatedNotification = await NotificationService.updateUserNotification(notification!.id, user.id, {
        dismissed: true,
      });

      expect(updatedNotification.dismissed).toBe(true);
    });

    it('should throw an error when updating a non-existent notification', async () => {
      await expectThrowsAsync(
        () => NotificationService.updateUserNotification(999, user.id, { dismissed: true }),
        'Notification not found',
      );
    });
  });

  describe('batchUpdateUserNotifications', () => {
    it('should update multiple notifications', async () => {
      const notifications = await Promise.all([
        NotificationService.createUserNotification({
          userId: user.id,
          type: NotificationType.PUBLISH,
          title: 'Notification 1',
          message: 'This is notification 1',
          category: NotificationCategory.DESCI_PUBLISH,
        }),
        NotificationService.createUserNotification({
          userId: user.id,
          type: NotificationType.PUBLISH,
          title: 'Notification 2',
          message: 'This is notification 2',
          category: NotificationCategory.DESCI_PUBLISH,
        }),
      ]);

      const updatedCount = await NotificationService.batchUpdateUserNotifications({
        notificationIds: notifications.map((n) => n!.id),
        userId: user.id,
        updateData: { dismissed: true },
      });

      expect(updatedCount).toBe(2);

      const updatedNotifications = await prisma.userNotifications.findMany({
        where: { id: { in: notifications.map((n) => n!.id) } },
      });

      expect(updatedNotifications.every((n) => n.dismissed)).toBe(true);
    });
  });

  describe('updateNotificationSettings', () => {
    it('should update user notification settings', async () => {
      await NotificationService.updateNotificationSettings(user.id, {
        [NotificationType.PUBLISH!]: false,
      });

      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
      const settings = updatedUser?.notificationSettings as Partial<Record<NotificationType, boolean>>;
      expect(settings[NotificationType.PUBLISH]).toBe(false);
    });
  });

  describe('getNotificationSettings', () => {
    it('should retrieve user notification settings', async () => {
      await NotificationService.updateNotificationSettings(user.id, {
        [NotificationType.PUBLISH!]: false,
      });

      const settings = await NotificationService.getNotificationSettings(user.id);

      expect(settings[NotificationType.PUBLISH]).toBe(false);
    });

    it('should return an empty object for users without settings', async () => {
      const settings = await NotificationService.getNotificationSettings(user.id);

      expect(settings).toEqual({});
    });
  });
});
