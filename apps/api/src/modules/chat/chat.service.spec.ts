import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { OrderStatusType } from '@pokeshop/shared';
import type {
  ChatRepository,
  CreateChatMessageInput,
  StoredChatMessageRecord,
  StoredChatRoomContext,
  StoredNotificationRecord,
} from './chat.repository.js';
import {
  assertChatRoomAccess,
  ChatError,
  getChatIndicators,
  listChatMessages,
  markChatRoomAsRead,
  sendChatMessage,
} from './chat.service.js';

function createSampleRoom(
  overrides?: Partial<StoredChatRoomContext>
): StoredChatRoomContext {
  const buyerId = overrides?.buyerId ?? randomUUID();
  const sellerId = overrides?.sellerId ?? randomUUID();
  const listingId = randomUUID();
  const orderId = overrides?.orderId ?? randomUUID();

  return {
    id: randomUUID(),
    orderId,
    status: 'NEGOCIACAO_ABERTA',
    buyerId,
    sellerId,
    buyer: { id: buyerId, name: 'Ash Ketchum' },
    seller: { id: sellerId, name: 'Misty Waterflower' },
    lastMessageAt: new Date('2026-11-26T10:00:00.000Z'),
    buyerLastReadAt: null,
    sellerLastReadAt: null,
    listing: {
      id: listingId,
      saleType: 'PRECO_FIXO',
      priceInCents: 15000,
      condition: 'PERFEITO_ESTADO',
      language: 'PT-BR',
      edition: 'Full Art',
      status: overrides?.status ?? 'NEGOCIACAO_ABERTA',
      card: {
        id: randomUUID(),
        tcgdexId: 'sv03-125',
        name: 'Charizard ex',
        setName: 'Obsidiana em Chamas',
        cardNumber: '125',
        rarity: 'Double Rare',
        imageUrl: null,
      },
    },
    ...overrides,
  };
}

function createFakeChatRepository(seed?: {
  rooms?: StoredChatRoomContext[];
  messages?: StoredChatMessageRecord[];
  notifications?: StoredNotificationRecord[];
}): ChatRepository & {
  rooms: StoredChatRoomContext[];
  messages: StoredChatMessageRecord[];
  notifications: StoredNotificationRecord[];
} {
  const rooms = [...(seed?.rooms ?? [])];
  const messages = [...(seed?.messages ?? [])];
  const notifications = [...(seed?.notifications ?? [])];

  return {
    rooms,
    messages,
    notifications,

    async findRoomContextByOrderId(orderId) {
      return rooms.find((room) => room.orderId === orderId) ?? null;
    },

    async findMessagesByRoomId(chatRoomId, cursor) {
      return messages
        .filter((msg) => {
          if (msg.chatRoomId !== chatRoomId) return false;
          if (!cursor?.after) return true;
          const msgTime = msg.createdAt.getTime();
          const afterTime = cursor.after.getTime();
          if (msgTime > afterTime) return true;
          if (msgTime === afterTime && cursor.afterId) {
            return msg.id > cursor.afterId;
          }
          return false;
        })
        .sort((a, b) => {
          const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
          return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
        });
    },

    async createMessageAtomically(input: CreateChatMessageInput) {
      const room = rooms.find((item) => item.id === input.chatRoomId);
      if (!room) throw new Error('Room not found');
      const senderName =
        input.participantRole === 'buyer' ? room.buyer.name : room.seller.name;

      const created: StoredChatMessageRecord = {
        id: randomUUID(),
        chatRoomId: input.chatRoomId,
        senderId: input.senderId,
        senderName,
        content: input.content,
        createdAt: input.now,
      };
      messages.push(created);
      room.lastMessageAt = input.now;
      if (input.participantRole === 'buyer') {
        room.buyerLastReadAt = input.now;
      } else {
        room.sellerLastReadAt = input.now;
      }
      return created;
    },

    async markRoomAsRead(input) {
      const room = rooms.find((item) => item.id === input.chatRoomId);
      if (room) {
        if (input.participantRole === 'buyer') {
          room.buyerLastReadAt = input.now;
        } else {
          room.sellerLastReadAt = input.now;
        }
      }
      for (const item of notifications) {
        if (
          item.userId === input.userId &&
          item.orderId === input.orderId &&
          item.readAt === null
        ) {
          item.readAt = input.now;
        }
      }
      return input.now;
    },

    async getIndicatorsForUser(userId) {
      const userRooms = rooms.filter(
        (room) => room.buyerId === userId || room.sellerId === userId
      );
      const unreadByOrder = userRooms.map((room) => {
        const lastReadAt =
          room.buyerId === userId ? room.buyerLastReadAt : room.sellerLastReadAt;
        const unreadCount = messages.filter(
          (msg) =>
            msg.chatRoomId === room.id &&
            msg.senderId !== userId &&
            (!lastReadAt || msg.createdAt.getTime() > lastReadAt.getTime())
        ).length;

        return {
          orderId: room.orderId,
          chatRoomId: room.id,
          unreadCount,
        };
      });

      const userAlerts = notifications
        .filter((item) => item.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return {
        unreadByOrder,
        unreadStatusAlertsCount: userAlerts.filter((item) => item.readAt === null).length,
        alerts: userAlerts,
      };
    },

    async markNotificationAsRead(notificationId, userId, now) {
      const found = notifications.find(
        (item) => item.id === notificationId && item.userId === userId
      );
      if (!found) return false;
      if (!found.readAt) found.readAt = now;
      return true;
    },

    async markAllNotificationsAsRead(userId, now) {
      let updatedCount = 0;
      for (const item of notifications) {
        if (item.userId === userId && item.readAt === null) {
          item.readAt = now;
          updatedCount += 1;
        }
      }
      return updatedCount;
    },
  };
}

describe('Serviço de chat privado da negociação (chat.service)', () => {
  it('assertChatRoomAccess identifica buyer/seller e bloqueia sala ausente (404) e terceiros (403)', () => {
    const room = createSampleRoom();
    const strangerId = randomUUID();

    const buyerCtx = assertChatRoomAccess(room, room.buyerId, 'read');
    assert.equal(buyerCtx.participantRole, 'buyer');
    assert.equal(buyerCtx.room.id, room.id);

    const sellerCtx = assertChatRoomAccess(room, room.sellerId, 'write');
    assert.equal(sellerCtx.participantRole, 'seller');

    assert.throws(
      () => assertChatRoomAccess(null, room.buyerId, 'read'),
      (err: unknown) => err instanceof ChatError && err.statusCode === 404
    );

    assert.throws(
      () => assertChatRoomAccess(room, strangerId, 'read'),
      (err: unknown) => err instanceof ChatError && err.statusCode === 403
    );

    assert.throws(
      () => assertChatRoomAccess(room, strangerId, 'write'),
      (err: unknown) => err instanceof ChatError && err.statusCode === 403
    );
  });

  it('assertChatRoomAccess não vaza status encerrado para terceiros (403) e diferencia read vs write (409)', () => {
    const strangerId = randomUUID();

    for (const closedStatus of ['VENDIDO', 'CANCELADO', 'DISPONIVEL'] as OrderStatusType[]) {
      const closedRoom = createSampleRoom({ status: closedStatus });

      // Terceiro continua recebendo 403 antes de qualquer checagem de status
      assert.throws(
        () => assertChatRoomAccess(closedRoom, strangerId, 'write'),
        (err: unknown) => err instanceof ChatError && err.statusCode === 403
      );

      // Participante não pode escrever em sala que não está NEGOCIACAO_ABERTA
      assert.throws(
        () => assertChatRoomAccess(closedRoom, closedRoom.buyerId, 'write'),
        (err: unknown) => err instanceof ChatError && err.statusCode === 409
      );

      // Participante ainda pode ler o histórico
      const readCtx = assertChatRoomAccess(closedRoom, closedRoom.sellerId, 'read');
      assert.equal(readCtx.participantRole, 'seller');
    }
  });

  it('sendChatMessage rejeita mensagem vazia/espaços (400) e atualiza lastMessageAt com clock controlado', async () => {
    const room = createSampleRoom();
    const repo = createFakeChatRepository({ rooms: [room] });
    const sentAt = new Date('2026-11-27T12:30:00.000Z');

    await assert.rejects(
      () =>
        sendChatMessage(
          room.orderId,
          room.buyerId,
          { content: '   \n\t  ' },
          repo,
          () => sentAt
        ),
      (err: unknown) => err instanceof ChatError && err.statusCode === 400
    );

    const created = await sendChatMessage(
      room.orderId,
      room.buyerId,
      { content: '  Olá, envio por carta registrada?  ' },
      repo,
      () => sentAt
    );

    assert.equal(created.content, 'Olá, envio por carta registrada?');
    assert.equal(created.createdAt, '2026-11-27T12:30:00.000Z');
    assert.equal(room.lastMessageAt.toISOString(), '2026-11-27T12:30:00.000Z');
  });

  it('calcula indicadores de mensagens não lidas e zera após markChatRoomAsRead', async () => {
    const room = createSampleRoom();
    const repo = createFakeChatRepository({ rooms: [room] });
    const t1 = new Date('2026-11-27T10:01:00.000Z');
    const t2 = new Date('2026-11-27T10:02:00.000Z');
    const t3 = new Date('2026-11-27T10:03:00.000Z');

    await sendChatMessage(room.orderId, room.buyerId, { content: 'Msg 1' }, repo, () => t1);
    await sendChatMessage(room.orderId, room.buyerId, { content: 'Msg 2' }, repo, () => t2);

    const sellerBeforeRead = await getChatIndicators(room.sellerId, repo);
    assert.equal(sellerBeforeRead.unreadMessagesCount, 2);
    assert.equal(sellerBeforeRead.totalBadgeCount, 2);

    const buyerIndicators = await getChatIndicators(room.buyerId, repo);
    assert.equal(buyerIndicators.unreadMessagesCount, 0);

    await markChatRoomAsRead(room.orderId, room.sellerId, repo, () => t3);

    const sellerAfterRead = await getChatIndicators(room.sellerId, repo);
    assert.equal(sellerAfterRead.unreadMessagesCount, 0);
    assert.equal(sellerAfterRead.totalBadgeCount, 0);

    const listed = await listChatMessages(room.orderId, room.sellerId, {}, repo);
    assert.equal(listed.messages.length, 2);
  });
});
