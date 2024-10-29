import { NotificationType } from '@prisma/client';
import { z } from 'zod';

export const GetNotificationsQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  perPage: z.string().regex(/^\d+$/).transform(Number).optional().default('25'),
  dismissed: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const CreateNotificationSchema = z.object({
  userId: z.number(),
  nodeUuid: z.string().optional(),
  type: z.nativeEnum(NotificationType),
  title: z.string(),
  message: z.string(),
  payload: z.record(z.unknown()).optional(),
});

export const UpdateDataSchema = z.object({
  dismissed: z.boolean().optional(),
});

export const BatchUpdateSchema = z.object({
  notificationIds: z.array(z.number()),
  updateData: UpdateDataSchema,
});
