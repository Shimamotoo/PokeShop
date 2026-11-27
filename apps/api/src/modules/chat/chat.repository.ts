import type { PrismaClient } from '@pokeshop/database';
import type { NotificationTypeValue, OrderStatusType } from '@pokeshop/shared';
import type { StoredOrderParticipant, StoredOrderRecord } from '../orders/orders.repository.js';

export type Clock = () => Date;

export type ChatParticipantRole = 'buyer' | 'seller';

export type StoredChatRoomContext = {
  id: string;
  orderId: string;
  status: OrderStatusType;
  buyerId: string;
  sellerId: string;
  buyer: StoredOrderParticipant;
  seller: StoredOrderParticipant;
  lastMessageAt: Date;
  buyerLastReadAt: Date | null;
  sellerLastReadAt: Date | null;
  listing: StoredOrderRecord['listing'];
};

export type StoredChatMessageRecord = {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: Date;
};

export type StoredNotificationRecord = {
  id: string;
  userId: string;
  orderId: string | null;
  type: NotificationTypeValue;
  message: string;
  readAt: Date | null;
  createdAt: Date;
};

export type CreateChatMessageInput = {
  chatRoomId: string;
  senderId: string;
  participantRole: ChatParticipantRole;
  content: string;
  now: Date;
};

export type MarkChatRoomReadInput = {
  chatRoomId: string;
  orderId: string;
  userId: string;
  participantRole: ChatParticipantRole;
  now: Date;
};

export type UnreadOrderCountRecord = {
  orderId: string;
  chatRoomId: string;
  unreadCount: number;
};

export type ChatIndicatorsSnapshot = {
  unreadByOrder: UnreadOrderCountRecord[];
  unreadStatusAlertsCount: number;
  alerts: StoredNotificationRecord[];
};

export interface ChatRepository {
  findRoomContextByOrderId(orderId: string): Promise<StoredChatRoomContext | null>;
  findMessagesByRoomId(
    chatRoomId: string,
    cursor?: { after?: Date; afterId?: string }
  ): Promise<StoredChatMessageRecord[]>;
  createMessageAtomically(input: CreateChatMessageInput): Promise<StoredChatMessageRecord>;
  markRoomAsRead(input: MarkChatRoomReadInput): Promise<Date>;
  getIndicatorsForUser(userId: string): Promise<ChatIndicatorsSnapshot>;
  markNotificationAsRead(notificationId: string, userId: string, now: Date): Promise<boolean>;
  markAllNotificationsAsRead(userId: string, now: Date): Promise<number>;
}

const roomInclude = {
  order: {
    select: {
      id: true,
      status: true,
      buyerId: true,
      sellerId: true,
      buyer: {
        select: {
          id: true,
          name: true,
        },
      },
      seller: {
        select: {
          id: true,
          name: true,
        },
      },
      listing: {
        select: {
          id: true,
          saleType: true,
          priceInCents: true,
          condition: true,
          language: true,
          edition: true,
          status: true,
          card: {
            select: {
              id: true,
              tcgdexId: true,
              name: true,
              setName: true,
              cardNumber: true,
              rarity: true,
              imageUrl: true,
            },
          },
        },
      },
    },
  },
} as const;

export function createPrismaChatRepository(prisma: PrismaClient): ChatRepository {
  return {
    async findRoomContextByOrderId(orderId: string): Promise<StoredChatRoomContext | null> {
      const room = await prisma.chatRoom.findUnique({
        where: { orderId },
        include: roomInclude,
      });

      if (!room) {
        return null;
      }

      return {
        id: room.id,
        orderId: room.orderId,
        status: room.order.status,
        buyerId: room.order.buyerId,
        sellerId: room.order.sellerId,
        buyer: room.order.buyer,
        seller: room.order.seller,
        lastMessageAt: room.lastMessageAt,
        buyerLastReadAt: room.buyerLastReadAt,
        sellerLastReadAt: room.sellerLastReadAt,
        listing: room.order.listing,
      };
    },

    async findMessagesByRoomId(
      chatRoomId: string,
      cursor?: { after?: Date; afterId?: string }
    ): Promise<StoredChatMessageRecord[]> {
      const cursorWhere =
        cursor?.after && cursor?.afterId
          ? {
              OR: [
                { createdAt: { gt: cursor.after } },
                { createdAt: cursor.after, id: { gt: cursor.afterId } },
              ],
            }
          : cursor?.after
            ? { createdAt: { gt: cursor.after } }
            : {};

      const rows = await prisma.chatMessage.findMany({
        where: {
          chatRoomId,
          ...cursorWhere,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: {
          sender: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return rows.map((row) => ({
        id: row.id,
        chatRoomId: row.chatRoomId,
        senderId: row.senderId,
        senderName: row.sender.name,
        content: row.content,
        createdAt: row.createdAt,
      }));
    },

    async createMessageAtomically(
      input: CreateChatMessageInput
    ): Promise<StoredChatMessageRecord> {
      return prisma.$transaction(async (tx) => {
        const message = await tx.chatMessage.create({
          data: {
            chatRoomId: input.chatRoomId,
            senderId: input.senderId,
            content: input.content,
            createdAt: input.now,
          },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        await tx.chatRoom.update({
          where: { id: input.chatRoomId },
          data: {
            lastMessageAt: input.now,
            updatedAt: input.now,
            ...(input.participantRole === 'buyer'
              ? { buyerLastReadAt: input.now }
              : { sellerLastReadAt: input.now }),
          },
        });

        return {
          id: message.id,
          chatRoomId: message.chatRoomId,
          senderId: message.senderId,
          senderName: message.sender.name,
          content: message.content,
          createdAt: message.createdAt,
        };
      });
    },

    async markRoomAsRead(input: MarkChatRoomReadInput): Promise<Date> {
      await prisma.$transaction(async (tx) => {
        await tx.chatRoom.update({
          where: { id: input.chatRoomId },
          data:
            input.participantRole === 'buyer'
              ? { buyerLastReadAt: input.now }
              : { sellerLastReadAt: input.now },
        });

        await tx.notification.updateMany({
          where: {
            userId: input.userId,
            orderId: input.orderId,
            readAt: null,
          },
          data: {
            readAt: input.now,
          },
        });
      });

      return input.now;
    },

    async getIndicatorsForUser(userId: string): Promise<ChatIndicatorsSnapshot> {
      const rooms = await prisma.chatRoom.findMany({
        where: {
          order: {
            OR: [{ buyerId: userId }, { sellerId: userId }],
          },
        },
        select: {
          id: true,
          orderId: true,
          buyerLastReadAt: true,
          sellerLastReadAt: true,
          order: {
            select: {
              buyerId: true,
              sellerId: true,
            },
          },
        },
      });

      const unreadByOrder = await Promise.all(
        rooms.map(async (room) => {
          const lastReadAt =
            room.order.buyerId === userId ? room.buyerLastReadAt : room.sellerLastReadAt;

          const unreadCount = await prisma.chatMessage.count({
            where: {
              chatRoomId: room.id,
              senderId: { not: userId },
              ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
            },
          });

          return {
            orderId: room.orderId,
            chatRoomId: room.id,
            unreadCount,
          };
        })
      );

      const [alerts, unreadStatusAlertsCount] = await Promise.all([
        prisma.notification.findMany({
          where: { userId },
          orderBy: [{ createdAt: 'desc' }],
          take: 20,
        }),
        prisma.notification.count({
          where: { userId, readAt: null },
        }),
      ]);

      return {
        unreadByOrder,
        unreadStatusAlertsCount,
        alerts: alerts.map((alert) => ({
          id: alert.id,
          userId: alert.userId,
          orderId: alert.orderId,
          type: alert.type,
          message: alert.message,
          readAt: alert.readAt,
          createdAt: alert.createdAt,
        })),
      };
    },

    async markNotificationAsRead(
      notificationId: string,
      userId: string,
      now: Date
    ): Promise<boolean> {
      const existing = await prisma.notification.findFirst({
        where: { id: notificationId, userId },
        select: { id: true, readAt: true },
      });

      if (!existing) {
        return false;
      }

      if (!existing.readAt) {
        await prisma.notification.update({
          where: { id: notificationId },
          data: { readAt: now },
        });
      }

      return true;
    },

    async markAllNotificationsAsRead(userId: string, now: Date): Promise<number> {
      const result = await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: now },
      });

      return result.count;
    },
  };
}
