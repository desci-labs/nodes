import { NotificationType, Prisma, User, UserNotifications, Node } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../client.js';
import { CreateNotificationSchema } from '../controllers/notifications/create.js';
import { GetNotificationsQuerySchema, PaginatedResponse } from '../controllers/notifications/index.js';
import { logger as parentLogger } from '../logger.js';
import { server } from '../server.js';
import { emitWebsocketEvent, WebSocketEventType } from '../utils/websocketHelpers.js';

type GetNotificationsQuery = z.infer<typeof GetNotificationsQuerySchema>;
export type CreateNotificationData = z.infer<typeof CreateNotificationSchema>;

const logger = parentLogger.child({
  module: 'UserNotifications::NotificationService',
});

export type NotificationSettings = Partial<Record<NotificationType, boolean>>;

export type NotificationUpdateData = {
  dismissed?: boolean;
  //   seen?: boolean; // future
};

export type CommentPayload = {
  type: 'COMMENTS';
  nodeUuid: string;
  annotationId: number;
};

export type PublishPayload = {
  type: 'PUBLISH';
  nodeUuid: string;
  dpid: string;
};

export const getUserNotifications = async (
  userId: number,
  query: GetNotificationsQuery,
): Promise<PaginatedResponse<UserNotifications>> => {
  const { page, perPage, dismissed = false } = query;
  const skip = (page - 1) * perPage;
  const whereClause = {
    userId,
    dismissed,
  };

  const [notifications, totalItems] = await Promise.all([
    prisma.userNotifications.findMany({
      where: whereClause,
      skip,
      take: perPage,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.userNotifications.count({ where: whereClause }),
  ]);

  const totalPages = Math.ceil(totalItems / perPage);

  return {
    data: notifications,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
    },
  };
};

export const createUserNotification = async (
  data: CreateNotificationData,
  options?: { throwOnDisabled?: boolean },
): Promise<UserNotifications | null> => {
  logger.info({ data }, 'Creating user notification');

  const settings = await getNotificationSettings(data.userId);

  if (!shouldSendNotification(settings, data.type)) {
    logger.warn({ userId: data.userId, type: data.type }, 'Notification creation blocked by user settings');
    if (options?.throwOnDisabled) throw new Error('Notification type is disabled for this user');
    return null;
  }

  if (data.nodeUuid) {
    // Validate node belongs to user
    const node = await prisma.node.findUnique({
      where: { uuid: data.nodeUuid },
      select: { ownerId: true },
    });

    if (!node) {
      logger.warn({ nodeUuid: data.nodeUuid }, 'Node not found');
      throw new Error('Node not found');
    }

    if (node.ownerId !== data.userId) {
      logger.warn({ nodeUuid: data.nodeUuid, userId: data.userId }, 'Node does not belong to the user');
      throw new Error('Node does not belong to the user');
    }
  }

  if (!Object.values(NotificationType).includes(data.type as NotificationType)) {
    // Validates valid notification type
    logger.warn({ type: data.type }, 'Invalid notification type');
    throw new Error('Invalid notification type');
  }

  const notificationData: Prisma.UserNotificationsCreateInput = {
    user: { connect: { id: data.userId } },
    type: data.type as NotificationType,
    title: data.title,
    message: data.message,
    dismissed: false,
    node: data.nodeUuid ? { connect: { uuid: data.nodeUuid } } : undefined,
    payload: data.payload ? (data.payload as Prisma.JsonObject) : undefined,
  };

  const notification = await prisma.userNotifications.create({
    data: notificationData,
  });

  logger.info({ notificationId: notification.id }, 'User notification created successfully');

  // Emit websocket push notification
  emitWebsocketEvent(data.userId, { type: WebSocketEventType.NOTIFICATION, data: 'invalidate-cache' });

  return notification;
};

export const updateUserNotification = async (
  notificationId: number,
  userId: number,
  updateData: NotificationUpdateData,
): Promise<UserNotifications> => {
  logger.info({ notificationId, userId, updateData }, 'Updating user notification');

  const notification = await prisma.userNotifications.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    logger.warn({ notificationId }, 'Notification not found');
    throw new Error('Notification not found');
  }

  if (notification.userId !== userId) {
    logger.warn({ notificationId, userId }, 'Notification does not belong to the user');
    throw new Error('Notification does not belong to the user');
  }

  const updatedNotification = await prisma.userNotifications.update({
    where: { id: notificationId },
    data: updateData,
  });

  logger.info({ notificationId: updatedNotification.id }, 'User notification updated successfully');
  return updatedNotification;
};

export const batchUpdateUserNotifications = async (
  notificationIds: number[],
  userId: number,
  updateData: NotificationUpdateData,
): Promise<number> => {
  logger.info({ notificationIds, userId, updateData }, 'Batch updating user notifications');

  const result = await prisma.userNotifications.updateMany({
    where: {
      id: { in: notificationIds },
      userId: userId,
    },
    data: updateData,
  });

  logger.info({ userId, count: result.count }, 'User notifications batch updated successfully');
  return result.count;
};

export const updateNotificationSettings = async (
  userId: number,
  newSettings: NotificationSettings,
): Promise<Partial<Record<NotificationType, boolean>>> => {
  logger.info({ userId, newSettings }, 'Updating user notification settings');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationSettings: true },
  });

  const currentSettings = (user?.notificationSettings as NotificationSettings) || {};
  const mergedSettings = { ...currentSettings, ...newSettings };

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      notificationSettings: mergedSettings as Prisma.JsonObject,
    },
  });

  logger.info({ userId, mergedSettings }, 'User notification settings updated successfully');
  return mergedSettings;
};

/*
 ** A JSON object stored on the User model, if <NotificationType> is set to false, the user will not receive notifications of that type,
 ** otherwise, they will receive notifications of that type. Note: Undefined types will default to true.
 */
export const getNotificationSettings = async (userId: number): Promise<NotificationSettings> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationSettings: true },
  });

  return (user?.notificationSettings as NotificationSettings) || {};
};

export const shouldSendNotification = (settings: NotificationSettings, type: NotificationType): boolean => {
  return settings[type] !== false;
};

export const emitNotificationForAnnotation = async (annotationId: number) => {
  const annotation = await prisma.annotation.findUnique({
    where: { id: annotationId },
    include: {
      author: true,
      node: {
        include: { owner: true },
      },
      attestation: {
        include: {
          node: {
            include: { owner: true },
          },
        },
      },
    },
  });

  if (!annotation) {
    logger.warn({ annotationId }, 'Annotation not found');
    return;
  }

  const annotationAuthor = annotation.author;
  const annotationAuthorName = annotationAuthor?.name || 'A user';
  const node = annotation.node || annotation.attestation?.node;
  const nodeOwner = node?.owner;

  if (!nodeOwner) {
    logger.warn({ annotationId }, 'Linked owner not found on annotation');
    return;
  }

  const dotlessUuid = node.uuid.replace(/\./g, '');

  const notificationData: CreateNotificationData = {
    userId: nodeOwner.id,
    type: NotificationType.COMMENTS,
    title: `${annotationAuthorName} commented on your research object`,
    message: `Your research object titled ${node.title}, has received a new comment.`, // TODO:: Ideally deserialize some of the message body from the annotation and show a truncated snippet
    nodeUuid: node.uuid,
    payload: { type: NotificationType.COMMENTS, nodeUuid: dotlessUuid, annotationId } as CommentPayload,
  };

  await createUserNotification(notificationData);
};
//
export const emitNotificationOnPublish = async (node: Node, user: User, dpid: string) => {
  const dotlessUuid = node.uuid.replace(/\./g, '');
  const notificationData: CreateNotificationData = {
    userId: user.id,
    type: NotificationType.PUBLISH,
    title: `Your research object has been published!`,
    message: `Your research object titled "${node.title}" has been published and is now available for public access.`,
    nodeUuid: node.uuid,
    payload: { type: NotificationType.PUBLISH, nodeUuid: dotlessUuid, dpid } as PublishPayload,
  };

  await createUserNotification(notificationData);
};
