import {
  MAX_CHAT_MESSAGE_LENGTH,
  type ChatIndicatorsResponse,
  type ChatMessageView,
  type ChatRoomContextView,
  type InAppNotificationView,
  type ListChatMessagesQuery,
  type ListChatMessagesResponse,
  type MarkChatReadResponse,
  type SendChatMessageInput,
} from '@pokeshop/shared';
import type {
  ChatParticipantRole,
  ChatRepository,
  Clock,
  StoredChatMessageRecord,
  StoredChatRoomContext,
  StoredNotificationRecord,
} from './chat.repository.js';

export class ChatError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 401 | 403 | 404 | 409
  ) {
    super(message);
    this.name = 'ChatError';
  }
}

export type ChatAccessMode = 'read' | 'write';

export type AuthorizedChatContext = {
  room: StoredChatRoomContext;
  participantRole: ChatParticipantRole;
};

export function assertChatRoomAccess(
  room: StoredChatRoomContext | null,
  requesterUserId: string,
  mode: ChatAccessMode
): AuthorizedChatContext {
  if (!room) {
    throw new ChatError('Chat não encontrado.', 404);
  }

  // Valida participante antes do status para não vazar estado da negociação a terceiros (anti-IDOR).
  let participantRole: ChatParticipantRole;
  if (requesterUserId === room.buyerId) {
    participantRole = 'buyer';
  } else if (requesterUserId === room.sellerId) {
    participantRole = 'seller';
  } else {
    throw new ChatError('Sem permissão para acessar o chat.', 403);
  }

  if (mode === 'write' && room.status !== 'NEGOCIACAO_ABERTA') {
    throw new ChatError(
      'Não é possível enviar mensagens porque a negociação não está aberta.',
      409
    );
  }

  return {
    room,
    participantRole,
  };
}

export function toChatRoomContextView(room: StoredChatRoomContext): ChatRoomContextView {
  return {
    id: room.id,
    orderId: room.orderId,
    status: room.status,
    buyerId: room.buyerId,
    sellerId: room.sellerId,
    buyer: room.buyer,
    seller: room.seller,
    lastMessageAt: room.lastMessageAt.toISOString(),
    listing: room.listing,
  };
}

export function toChatMessageView(message: StoredChatMessageRecord): ChatMessageView {
  return {
    id: message.id,
    chatRoomId: message.chatRoomId,
    senderId: message.senderId,
    senderName: message.senderName,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

export function toNotificationView(
  notification: StoredNotificationRecord
): InAppNotificationView {
  return {
    id: notification.id,
    orderId: notification.orderId,
    type: notification.type,
    message: notification.message,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
  };
}

export async function listChatMessages(
  orderId: string,
  requesterUserId: string,
  query: ListChatMessagesQuery,
  repository: ChatRepository
): Promise<ListChatMessagesResponse> {
  const room = await repository.findRoomContextByOrderId(orderId);
  const { room: authorizedRoom } = assertChatRoomAccess(room, requesterUserId, 'read');

  const afterDate = query.after ? new Date(query.after) : undefined;
  const messages = await repository.findMessagesByRoomId(authorizedRoom.id, {
    after: afterDate,
    afterId: query.afterId,
  });

  return {
    room: toChatRoomContextView(authorizedRoom),
    messages: messages.map(toChatMessageView),
  };
}

export async function sendChatMessage(
  orderId: string,
  requesterUserId: string,
  input: SendChatMessageInput,
  repository: ChatRepository,
  clock: Clock = () => new Date()
): Promise<ChatMessageView> {
  const content = input.content.trim();
  if (content.length === 0) {
    throw new ChatError('A mensagem não pode estar vazia.', 400);
  }
  if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new ChatError(
      `A mensagem deve ter no máximo ${MAX_CHAT_MESSAGE_LENGTH} caracteres.`,
      400
    );
  }

  const room = await repository.findRoomContextByOrderId(orderId);
  const { room: authorizedRoom, participantRole } = assertChatRoomAccess(
    room,
    requesterUserId,
    'write'
  );

  const created = await repository.createMessageAtomically({
    chatRoomId: authorizedRoom.id,
    senderId: requesterUserId,
    participantRole,
    content,
    now: clock(),
  });

  return toChatMessageView(created);
}

export async function markChatRoomAsRead(
  orderId: string,
  requesterUserId: string,
  repository: ChatRepository,
  clock: Clock = () => new Date()
): Promise<MarkChatReadResponse> {
  const room = await repository.findRoomContextByOrderId(orderId);
  const { room: authorizedRoom, participantRole } = assertChatRoomAccess(
    room,
    requesterUserId,
    'read'
  );

  const readAt = await repository.markRoomAsRead({
    chatRoomId: authorizedRoom.id,
    orderId: authorizedRoom.orderId,
    userId: requesterUserId,
    participantRole,
    now: clock(),
  });

  return {
    orderId: authorizedRoom.orderId,
    readAt: readAt.toISOString(),
  };
}

export async function getChatIndicators(
  userId: string,
  repository: ChatRepository
): Promise<ChatIndicatorsResponse> {
  const snapshot = await repository.getIndicatorsForUser(userId);
  const unreadByOrder = snapshot.unreadByOrder.filter((item) => item.unreadCount > 0);
  const unreadMessagesCount = unreadByOrder.reduce(
    (sum, item) => sum + item.unreadCount,
    0
  );

  return {
    unreadMessagesCount,
    unreadStatusAlertsCount: snapshot.unreadStatusAlertsCount,
    totalBadgeCount: unreadMessagesCount + snapshot.unreadStatusAlertsCount,
    unreadByOrder,
    alerts: snapshot.alerts.map(toNotificationView),
  };
}

export async function markNotificationAsRead(
  notificationId: string,
  userId: string,
  repository: ChatRepository,
  clock: Clock = () => new Date()
): Promise<{ id: string; readAt: string }> {
  const now = clock();
  const found = await repository.markNotificationAsRead(notificationId, userId, now);
  if (!found) {
    throw new ChatError('Notificação não encontrada.', 404);
  }

  return {
    id: notificationId,
    readAt: now.toISOString(),
  };
}

export async function markAllNotificationsAsRead(
  userId: string,
  repository: ChatRepository,
  clock: Clock = () => new Date()
): Promise<{ updatedCount: number }> {
  const updatedCount = await repository.markAllNotificationsAsRead(userId, clock());
  return { updatedCount };
}
