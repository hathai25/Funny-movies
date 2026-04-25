import { z } from 'zod';

export const notificationPayloadSchema = z.object({
  title: z.string(),
  sharerName: z.string(),
  videoId: z.string(),
  youtubeId: z.string(),
  thumbnailUrl: z.string().nullable(),
});

export const notificationSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  payload: notificationPayloadSchema,
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
  unreadCount: z.number().int().nonnegative(),
});

export const markReadSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
});

export const wsNotificationEventSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  title: z.string(),
  sharerName: z.string(),
  youtubeId: z.string(),
  thumbnailUrl: z.string().nullable(),
  createdAt: z.string(),
});

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationList = z.infer<typeof notificationListSchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
export type WsNotificationEvent = z.infer<typeof wsNotificationEventSchema>;

export const WS_EVENTS = {
  NOTIFICATION_NEW: 'notification:new',
} as const;
