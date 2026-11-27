import { z } from 'zod';
import { listingStatusSchema } from './listing.schema.js';
import { orderListingSummarySchema, orderParticipantSchema } from './order.schema.js';

export const CHAT_POLLING_INTERVAL_MS = 4000;
export const INDICATORS_POLLING_INTERVAL_MS = 30000;
export const MAX_CHAT_MESSAGE_LENGTH = 2000;

export const notificationTypeSchema = z.enum([
  'ORDER_RESERVED',
  'ORDER_CONFIRMED',
  'ORDER_DECLINED',
  'PROPOSAL_ACCEPTED',
  'NEGOTIATION_INACTIVITY_WARNING',
]);

export type NotificationTypeValue = z.infer<typeof notificationTypeSchema>;

export const sendChatMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'A mensagem não pode estar vazia.')
    .max(
      MAX_CHAT_MESSAGE_LENGTH,
      `A mensagem deve ter no máximo ${MAX_CHAT_MESSAGE_LENGTH} caracteres.`
    ),
});

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

export const listChatMessagesQuerySchema = z.object({
  after: z.string().datetime().optional(),
  afterId: z.string().uuid().optional(),
});

export type ListChatMessagesQuery = z.infer<typeof listChatMessagesQuerySchema>;

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  chatRoomId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderName: z.string(),
  content: z.string(),
  createdAt: z.string(),
});

export type ChatMessageView = z.infer<typeof chatMessageSchema>;

export const chatRoomContextSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  status: listingStatusSchema,
  buyerId: z.string().uuid(),
  sellerId: z.string().uuid(),
  buyer: orderParticipantSchema,
  seller: orderParticipantSchema,
  lastMessageAt: z.string(),
  listing: orderListingSummarySchema,
});

export type ChatRoomContextView = z.infer<typeof chatRoomContextSchema>;

export const listChatMessagesResponseSchema = z.object({
  room: chatRoomContextSchema,
  messages: z.array(chatMessageSchema),
});

export type ListChatMessagesResponse = z.infer<typeof listChatMessagesResponseSchema>;

export const markChatReadResponseSchema = z.object({
  orderId: z.string().uuid(),
  readAt: z.string(),
});

export type MarkChatReadResponse = z.infer<typeof markChatReadResponseSchema>;

export const unreadOrderCountSchema = z.object({
  orderId: z.string().uuid(),
  chatRoomId: z.string().uuid(),
  unreadCount: z.number().int().nonnegative(),
});

export type UnreadOrderCountView = z.infer<typeof unreadOrderCountSchema>;

export const inAppNotificationSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid().nullable(),
  type: notificationTypeSchema,
  message: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export type InAppNotificationView = z.infer<typeof inAppNotificationSchema>;

export const chatIndicatorsResponseSchema = z.object({
  unreadMessagesCount: z.number().int().nonnegative(),
  unreadStatusAlertsCount: z.number().int().nonnegative(),
  totalBadgeCount: z.number().int().nonnegative(),
  unreadByOrder: z.array(unreadOrderCountSchema),
  alerts: z.array(inAppNotificationSchema),
});

export type ChatIndicatorsResponse = z.infer<typeof chatIndicatorsResponseSchema>;
