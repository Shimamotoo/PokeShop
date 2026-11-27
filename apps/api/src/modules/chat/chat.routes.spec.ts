import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type {
  AuthUserRepository,
  CreateUserRecordInput,
  StoredUserRecord,
} from '../auth/auth.service.js';
import type {
  ListingsRepository,
  MediaAccessContext,
  StoredCardSummary,
  StoredListingRecord,
} from '../listings/listings.repository.js';
import type { S3StorageProvider } from '../listings/s3-storage.provider.js';
import type { OrdersRepository, StoredOrderRecord } from '../orders/orders.repository.js';
import type {
  AcceptProposalInput,
  CreateProposalInput,
  ProposalListingSnapshot,
  ProposalsRepository,
  StoredProposalRecord,
} from '../proposals/proposals.repository.js';
import type {
  ChatRepository,
  CreateChatMessageInput,
  StoredChatMessageRecord,
  StoredChatRoomContext,
  StoredNotificationRecord,
} from './chat.repository.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/pokeshop_test?schema=public';

process.env.DATABASE_URL = TEST_DATABASE_URL;

function formatBirthDateForAge(yearsOld: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - yearsOld);
  return date.toISOString().slice(0, 10);
}

describe('Rotas HTTP de chat privado e indicadores (/orders/:orderId/chat e /chat/indicators)', () => {
  let app: FastifyInstance;
  let cardId: string;
  let usePostgresTestDb = false;

  const testUsers: StoredUserRecord[] = [];
  const testCards: StoredCardSummary[] = [];
  const testListings: StoredListingRecord[] = [];
  const testOrders: StoredOrderRecord[] = [];
  const testProposals: Array<StoredProposalRecord & { listing: ProposalListingSnapshot }> = [];
  const testChatRooms: StoredChatRoomContext[] = [];
  const testChatMessages: StoredChatMessageRecord[] = [];
  const testNotifications: StoredNotificationRecord[] = [];
  const testMediaContexts: Record<string, MediaAccessContext> = {};

  const fakeS3Storage: S3StorageProvider = {
    async createPresignedUploadUrl(input) {
      const s3Key = `listings/${input.sellerId}/${randomUUID()}-${input.fileName}`;
      return {
        s3Key,
        uploadUrl: `https://s3-fake.pokeshop.test/upload/${encodeURIComponent(s3Key)}`,
        expiresIn: 900,
      };
    },
    async createPresignedDownloadUrl(s3Key) {
      return {
        s3Key,
        downloadUrl: `https://s3-fake.pokeshop.test/download/${encodeURIComponent(s3Key)}`,
        expiresIn: 900,
      };
    },
  };

  const fallbackAuthRepo: AuthUserRepository = {
    async findByEmail(email) {
      return testUsers.find((u) => u.email === email) ?? null;
    },
    async findById(id) {
      return testUsers.find((u) => u.id === id) ?? null;
    },
    async findByGoogleId(googleId) {
      return testUsers.find((u) => u.googleId === googleId) ?? null;
    },
    async create(data: CreateUserRecordInput) {
      const created: StoredUserRecord = {
        id: randomUUID(),
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash ?? null,
        birthDate: data.birthDate,
        termsAcceptedAt: data.termsAcceptedAt,
        googleId: data.googleId ?? null,
        role: 'USER',
        isBanned: false,
      };
      testUsers.push(created);
      return created;
    },
    async linkGoogleId(userId, googleId) {
      const user = testUsers.find((u) => u.id === userId);
      if (!user) throw new Error('User not found');
      user.googleId = googleId;
      return user;
    },
  };

  function resolveFallbackActiveOrder(listingId: string) {
    const active = testOrders
      .filter(
        (order) =>
          order.listingId === listingId &&
          (order.status === 'AGUARDANDO_CONFIRMACAO' ||
            order.status === 'NEGOCIACAO_ABERTA' ||
            order.status === 'VENDIDO')
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (!active) return null;

    return {
      id: active.id,
      buyerId: active.buyerId,
      sellerId: active.sellerId,
      status: active.status,
      createdAt: active.createdAt,
      confirmedAt: active.confirmedAt,
      buyer: active.buyer,
    };
  }

  const fallbackListingsRepo: ListingsRepository = {
    async findCardById(id) {
      return testCards.find((c) => c.id === id) ?? null;
    },
    async create(data) {
      const card = testCards.find((c) => c.id === data.cardId);
      const seller = testUsers.find((u) => u.id === data.sellerId);
      if (!card || !seller) throw new Error('Card or seller not found');
      const now = new Date();
      const record: StoredListingRecord = {
        id: randomUUID(),
        cardId: data.cardId,
        sellerId: data.sellerId,
        saleType: data.saleType,
        priceInCents: data.priceInCents,
        startingPriceInCents: data.startingPriceInCents ?? null,
        condition: data.condition,
        language: data.language,
        edition: data.edition,
        description: data.description,
        status: 'DISPONIVEL',
        createdAt: now,
        updatedAt: now,
        card,
        seller: {
          id: seller.id,
          name: seller.name,
          profileVisibility: 'PUBLIC',
        },
        photos: data.photoKeys.map((s3Key, index) => {
          testMediaContexts[s3Key] = {
            s3Key,
            ownerId: seller.id,
            visibility: 'PUBLIC',
          };
          return {
            id: randomUUID(),
            s3Key,
            orderIndex: index,
          };
        }),
        activeOrder: null,
      };
      testListings.push(record);
      return record;
    },
    async findById(id) {
      const listing = testListings.find((l) => l.id === id);
      if (!listing) return null;
      return {
        ...listing,
        activeOrder: resolveFallbackActiveOrder(listing.id),
      };
    },
    async findMany(filter) {
      return testListings
        .filter((l) => {
          if (filter.cardId && l.cardId !== filter.cardId) return false;
          if (filter.tcgdexId && l.card.tcgdexId !== filter.tcgdexId) return false;
          if (filter.sellerId && l.sellerId !== filter.sellerId) return false;
          if (filter.saleType && l.saleType !== filter.saleType) return false;
          if (filter.status && l.status !== filter.status) return false;
          return true;
        })
        .map((listing) => ({
          ...listing,
          activeOrder: resolveFallbackActiveOrder(listing.id),
        }));
    },
    async cancelListing(id) {
      const listing = testListings.find((l) => l.id === id);
      if (!listing) throw new Error('Listing not found');
      listing.status = 'CANCELADO';
      listing.updatedAt = new Date();
      return {
        ...listing,
        activeOrder: resolveFallbackActiveOrder(listing.id),
      };
    },
    async findMediaAccessContext(s3Key) {
      return testMediaContexts[s3Key] ?? null;
    },
  };

  const fallbackOrdersRepo: OrdersRepository = {
    async findListingForReservation(listingId) {
      const listing = testListings.find((l) => l.id === listingId);
      if (!listing) return null;
      return {
        id: listing.id,
        sellerId: listing.sellerId,
        saleType: listing.saleType,
        priceInCents: listing.priceInCents,
        condition: listing.condition,
        language: listing.language,
        edition: listing.edition,
        status: listing.status,
        sellerProfileVisibility: listing.seller.profileVisibility,
        card: listing.card,
      };
    },
    async reserveListingAtomically(input) {
      const listing = testListings.find((l) => l.id === input.listingId);
      const buyer = testUsers.find((u) => u.id === input.buyerId);
      const seller = testUsers.find((u) => u.id === input.sellerId);
      if (
        !listing ||
        !buyer ||
        !seller ||
        listing.status !== 'DISPONIVEL' ||
        listing.saleType !== 'PRECO_FIXO'
      ) {
        return null;
      }

      listing.status = 'AGUARDANDO_CONFIRMACAO';
      listing.updatedAt = input.now;

      const order: StoredOrderRecord = {
        id: randomUUID(),
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        status: 'AGUARDANDO_CONFIRMACAO',
        confirmedAt: null,
        soldAt: null,
        cancelledAt: null,
        createdAt: input.now,
        updatedAt: input.now,
        buyer: { id: buyer.id, name: buyer.name },
        seller: { id: seller.id, name: seller.name },
        chatRoom: null,
        listing: {
          id: listing.id,
          saleType: listing.saleType,
          priceInCents: listing.priceInCents,
          condition: listing.condition,
          language: listing.language,
          edition: listing.edition,
          status: listing.status,
          card: listing.card,
        },
      };

      testOrders.push(order);
      testNotifications.push({
        id: randomUUID(),
        userId: seller.id,
        orderId: order.id,
        type: 'ORDER_RESERVED',
        message: 'Você recebeu uma nova solicitação de compra por preço fixo.',
        readAt: null,
        createdAt: input.now,
      });
      return order;
    },
    async findOrderById(orderId) {
      return testOrders.find((o) => o.id === orderId) ?? null;
    },
    async findOrdersByUser(filter) {
      return testOrders
        .filter((o) => {
          if (filter.role === 'buyer' && o.buyerId !== filter.userId) return false;
          if (filter.role === 'seller' && o.sellerId !== filter.userId) return false;
          if (
            filter.role === 'all' &&
            o.buyerId !== filter.userId &&
            o.sellerId !== filter.userId
          ) {
            return false;
          }
          if (filter.status && o.status !== filter.status) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async confirmOrderAtomically(orderId, now) {
      const order = testOrders.find((o) => o.id === orderId);
      if (!order || order.status !== 'AGUARDANDO_CONFIRMACAO') return null;

      const listing = testListings.find((l) => l.id === order.listingId);
      if (!listing || listing.status !== 'AGUARDANDO_CONFIRMACAO') return null;

      const chatRoomId = randomUUID();
      listing.status = 'NEGOCIACAO_ABERTA';
      listing.updatedAt = now;
      order.status = 'NEGOCIACAO_ABERTA';
      order.confirmedAt = now;
      order.updatedAt = now;
      order.chatRoom = { id: chatRoomId };
      order.listing.status = 'NEGOCIACAO_ABERTA';

      testChatRooms.push({
        id: chatRoomId,
        orderId: order.id,
        status: order.status,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        buyer: order.buyer,
        seller: order.seller,
        lastMessageAt: now,
        buyerLastReadAt: null,
        sellerLastReadAt: null,
        listing: order.listing,
      });

      testNotifications.push({
        id: randomUUID(),
        userId: order.buyerId,
        orderId: order.id,
        type: 'ORDER_CONFIRMED',
        message: 'Disponibilidade confirmada! O chat da negociação já está aberto.',
        readAt: null,
        createdAt: now,
      });

      return order;
    },
    async declineOrderAtomically(orderId, now) {
      const order = testOrders.find((o) => o.id === orderId);
      if (!order || order.status !== 'AGUARDANDO_CONFIRMACAO') return null;
      const listing = testListings.find((l) => l.id === order.listingId);
      if (!listing || listing.status !== 'AGUARDANDO_CONFIRMACAO') return null;

      listing.status = 'DISPONIVEL';
      listing.updatedAt = now;
      order.status = 'CANCELADO';
      order.cancelledAt = now;
      order.updatedAt = now;
      order.listing.status = 'DISPONIVEL';

      testNotifications.push({
        id: randomUUID(),
        userId: order.buyerId,
        orderId: order.id,
        type: 'ORDER_DECLINED',
        message: 'O vendedor recusou a solicitação de compra. O exemplar voltou à loja.',
        readAt: null,
        createdAt: now,
      });
      return order;
    },
    async findExpiredPendingOrderIds() {
      return [];
    },
    async expireOrderAtomically() {
      return false;
    },
  };

  const fallbackProposalsRepo: ProposalsRepository = {
    async findListingForProposal(id) {
      const listing = testListings.find((l) => l.id === id);
      if (!listing) return null;
      return {
        id: listing.id,
        sellerId: listing.sellerId,
        saleType: listing.saleType,
        status: listing.status,
        startingPriceInCents: listing.startingPriceInCents,
      };
    },
    async createProposalAtomically(input: CreateProposalInput) {
      const listing = testListings.find((l) => l.id === input.listingId);
      if (!listing || listing.status !== 'DISPONIVEL' || listing.saleType !== 'PROPOSTAS') {
        return null;
      }
      const buyer = testUsers.find((u) => u.id === input.buyerId);
      if (!buyer) throw new Error('Buyer not found');
      const proposal: StoredProposalRecord = {
        id: randomUUID(),
        listingId: listing.id,
        buyerId: buyer.id,
        amountInCents: input.amountInCents,
        status: 'PENDENTE',
        createdAt: input.now,
        updatedAt: input.now,
        buyer: { id: buyer.id, name: buyer.name },
      };
      testProposals.push({
        ...proposal,
        listing: {
          id: listing.id,
          sellerId: listing.sellerId,
          saleType: listing.saleType,
          status: listing.status,
          startingPriceInCents: listing.startingPriceInCents,
        },
      });
      return proposal;
    },
    async findProposalForDecision(id) {
      const found = testProposals.find((p) => p.id === id);
      if (!found) return null;
      const listing = testListings.find((l) => l.id === found.listingId);
      if (!listing) return null;
      return {
        ...found,
        listing: {
          id: listing.id,
          sellerId: listing.sellerId,
          saleType: listing.saleType,
          status: listing.status,
          startingPriceInCents: listing.startingPriceInCents,
        },
      };
    },
    async findProposalsForSeller(id, sellerId) {
      const listing = testListings.find((l) => l.id === id && l.sellerId === sellerId);
      if (!listing) return null;
      return testProposals.filter((p) => p.listingId === id);
    },
    async acceptProposalAtomically(input: AcceptProposalInput) {
      const proposal = testProposals.find((p) => p.id === input.proposalId);
      if (!proposal || proposal.status !== 'PENDENTE') return null;
      const listing = testListings.find((l) => l.id === proposal.listingId);
      if (!listing || listing.status !== 'DISPONIVEL') return null;

      listing.status = 'NEGOCIACAO_ABERTA';
      listing.updatedAt = input.now;
      proposal.status = 'ACEITA';
      proposal.updatedAt = input.now;
      for (const other of testProposals) {
        if (other.listingId === listing.id && other.id !== proposal.id && other.status === 'PENDENTE') {
          other.status = 'RECUSADA';
          other.updatedAt = input.now;
        }
      }

      const buyer = testUsers.find((u) => u.id === proposal.buyerId)!;
      const seller = testUsers.find((u) => u.id === listing.sellerId)!;
      const chatRoomId = randomUUID();
      const order: StoredOrderRecord = {
        id: randomUUID(),
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        status: 'NEGOCIACAO_ABERTA',
        confirmedAt: input.now,
        soldAt: null,
        cancelledAt: null,
        createdAt: input.now,
        updatedAt: input.now,
        buyer: { id: buyer.id, name: buyer.name },
        seller: { id: seller.id, name: seller.name },
        chatRoom: { id: chatRoomId },
        listing: {
          id: listing.id,
          saleType: listing.saleType,
          priceInCents: listing.priceInCents,
          condition: listing.condition,
          language: listing.language,
          edition: listing.edition,
          status: listing.status,
          card: listing.card,
        },
      };
      testOrders.push(order);

      testChatRooms.push({
        id: chatRoomId,
        orderId: order.id,
        status: order.status,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        buyer: order.buyer,
        seller: order.seller,
        lastMessageAt: input.now,
        buyerLastReadAt: null,
        sellerLastReadAt: null,
        listing: order.listing,
      });

      testNotifications.push({
        id: randomUUID(),
        userId: buyer.id,
        orderId: order.id,
        type: 'PROPOSAL_ACCEPTED',
        message: 'Sua proposta foi aceita! O chat da negociação já está disponível.',
        readAt: null,
        createdAt: input.now,
      });

      return order;
    },
    async declineProposalAtomically(id, now) {
      const proposal = testProposals.find((p) => p.id === id && p.status === 'PENDENTE');
      if (!proposal) return null;
      proposal.status = 'RECUSADA';
      proposal.updatedAt = now;
      return proposal;
    },
  };

  const fallbackChatRepo: ChatRepository = {
    async findRoomContextByOrderId(orderId) {
      return testChatRooms.find((room) => room.orderId === orderId) ?? null;
    },
    async findMessagesByRoomId(chatRoomId, cursor) {
      return testChatMessages
        .filter((msg) => {
          if (msg.chatRoomId !== chatRoomId) return false;
          if (!cursor?.after) return true;
          const t = msg.createdAt.getTime();
          const afterT = cursor.after.getTime();
          if (t > afterT) return true;
          if (t === afterT && cursor.afterId) return msg.id > cursor.afterId;
          return false;
        })
        .sort((a, b) => {
          const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
          return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
        });
    },
    async createMessageAtomically(input: CreateChatMessageInput) {
      const room = testChatRooms.find((r) => r.id === input.chatRoomId);
      if (!room) throw new Error('Chat room not found');
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
      testChatMessages.push(created);
      room.lastMessageAt = input.now;
      if (input.participantRole === 'buyer') {
        room.buyerLastReadAt = input.now;
      } else {
        room.sellerLastReadAt = input.now;
      }
      return created;
    },
    async markRoomAsRead(input) {
      const room = testChatRooms.find((r) => r.id === input.chatRoomId);
      if (room) {
        if (input.participantRole === 'buyer') {
          room.buyerLastReadAt = input.now;
        } else {
          room.sellerLastReadAt = input.now;
        }
      }
      for (const n of testNotifications) {
        if (n.userId === input.userId && n.orderId === input.orderId && n.readAt === null) {
          n.readAt = input.now;
        }
      }
      return input.now;
    },
    async getIndicatorsForUser(userId) {
      const userRooms = testChatRooms.filter(
        (r) => r.buyerId === userId || r.sellerId === userId
      );
      const unreadByOrder = userRooms.map((room) => {
        const lastReadAt =
          room.buyerId === userId ? room.buyerLastReadAt : room.sellerLastReadAt;
        const unreadCount = testChatMessages.filter(
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
      const userAlerts = testNotifications
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return {
        unreadByOrder,
        unreadStatusAlertsCount: userAlerts.filter((n) => n.readAt === null).length,
        alerts: userAlerts,
      };
    },
    async markNotificationAsRead(notificationId, userId, now) {
      const found = testNotifications.find(
        (n) => n.id === notificationId && n.userId === userId
      );
      if (!found) return false;
      if (!found.readAt) found.readAt = now;
      return true;
    },
    async markAllNotificationsAsRead(userId, now) {
      let count = 0;
      for (const n of testNotifications) {
        if (n.userId === userId && n.readAt === null) {
          n.readAt = now;
          count += 1;
        }
      }
      return count;
    },
  };

  before(async () => {
    const [{ buildApp }, { prisma }] = await Promise.all([
      import('../../app.js'),
      import('@pokeshop/database'),
    ]);

    try {
      await prisma.$queryRaw`SELECT 1`;
      usePostgresTestDb = true;
    } catch {
      usePostgresTestDb = false;
    }

    app = buildApp({
      logger: false,
      ...(usePostgresTestDb
        ? {
            listings: { s3Storage: fakeS3Storage },
          }
        : {
            auth: { authRepository: fallbackAuthRepo },
            listings: { listingsRepository: fallbackListingsRepo, s3Storage: fakeS3Storage },
            orders: { ordersRepository: fallbackOrdersRepo },
            proposals: { proposalsRepository: fallbackProposalsRepo },
            chat: { chatRepository: fallbackChatRepo },
          }),
    });
    await app.ready();
  });

  beforeEach(async () => {
    if (usePostgresTestDb) {
      const { prisma } = await import('@pokeshop/database');
      await prisma.notification.deleteMany();
      await prisma.chatMessage.deleteMany();
      await prisma.chatRoom.deleteMany();
      await prisma.postPhoto.deleteMany();
      await prisma.post.deleteMany();
      await prisma.listingPhoto.deleteMany();
      await prisma.proposal.deleteMany();
      await prisma.order.deleteMany();
      await prisma.listing.deleteMany();
      await prisma.collectionItem.deleteMany();
      await prisma.collection.deleteMany();
      await prisma.card.deleteMany();
      await prisma.user.deleteMany();

      const card = await prisma.card.create({
        data: {
          tcgdexId: 'sv03-125',
          name: 'Charizard ex',
          setName: 'Obsidiana em Chamas',
          cardNumber: '125',
          rarity: 'Double Rare',
          imageUrl: 'https://assets.tcgdex.net/pt/sv/sv03/125',
        },
      });
      cardId = card.id;
    } else {
      testUsers.length = 0;
      testCards.length = 0;
      testListings.length = 0;
      testOrders.length = 0;
      testProposals.length = 0;
      testChatRooms.length = 0;
      testChatMessages.length = 0;
      testNotifications.length = 0;
      for (const key of Object.keys(testMediaContexts)) {
        delete testMediaContexts[key];
      }

      cardId = randomUUID();
      testCards.push({
        id: cardId,
        tcgdexId: 'sv03-125',
        name: 'Charizard ex',
        setName: 'Obsidiana em Chamas',
        cardNumber: '125',
        rarity: 'Double Rare',
        imageUrl: 'https://assets.tcgdex.net/pt/sv/sv03/125',
      });
    }
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  async function registerAndLogin(name: string, email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name,
        email,
        password: 'password-123',
        birthDate: formatBirthDateForAge(22),
        termsAccepted: true,
      },
    });
    assert.equal(res.statusCode, 201);
    return res.json() as {
      token: string;
      user: { id: string; email: string; name: string };
    };
  }

  async function createFixedListing(sellerToken: string, sellerId: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        cardId,
        saleType: 'PRECO_FIXO',
        priceInCents: 25000,
        condition: 'PERFEITO_ESTADO',
        language: 'PT-BR',
        photoKeys: [`listings/${sellerId}/foto.jpg`],
      },
    });
    assert.equal(res.statusCode, 201);
    return res.json() as { id: string };
  }

  async function createProposalListing(sellerToken: string, sellerId: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        cardId,
        saleType: 'PROPOSTAS',
        startingPriceInCents: 10000,
        condition: 'POUCO_USADA',
        language: 'PT-BR',
        photoKeys: [`listings/${sellerId}/proposta.jpg`],
      },
    });
    assert.equal(res.statusCode, 201);
    return res.json() as { id: string };
  }

  it('libera sala de chat após confirmação de preço fixo e permite troca de mensagens e polling incremental', async () => {
    const seller = await registerAndLogin('Misty', 'misty@chat.test');
    const buyer = await registerAndLogin('Ash', 'ash@chat.test');
    const listing = await createFixedListing(seller.token, seller.user.id);

    const reserveRes = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${buyer.token}` },
      payload: { listingId: listing.id },
    });
    assert.equal(reserveRes.statusCode, 201);
    const orderId = reserveRes.json().id as string;

    // Antes da confirmação, sala ainda não existe -> 404
    const beforeConfirm = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/chat/messages`,
      headers: { authorization: `Bearer ${buyer.token}` },
    });
    assert.equal(beforeConfirm.statusCode, 404);

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/confirm`,
      headers: { authorization: `Bearer ${seller.token}` },
    });
    assert.equal(confirmRes.statusCode, 200);
    assert.ok(confirmRes.json().chatRoomId);

    const firstMsgRes = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/chat/messages`,
      headers: { authorization: `Bearer ${buyer.token}` },
      payload: { content: 'Olá! Podemos combinar envio por carta registrada?' },
    });
    assert.equal(firstMsgRes.statusCode, 201);
    const firstMsg = firstMsgRes.json() as { id: string; createdAt: string; content: string };

    // Pequena pausa para garantir timestamp distinto no PostgreSQL
    await new Promise((resolve) => setTimeout(resolve, 15));

    const secondMsgRes = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/chat/messages`,
      headers: { authorization: `Bearer ${seller.token}` },
      payload: { content: 'Combinado! Frete fica R$ 15 via PIX.' },
    });
    assert.equal(secondMsgRes.statusCode, 201);

    const fullHistory = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/chat/messages`,
      headers: { authorization: `Bearer ${buyer.token}` },
    });
    assert.equal(fullHistory.statusCode, 200);
    assert.equal(fullHistory.json().messages.length, 2);
    assert.equal(
      fullHistory.json().messages[0].content,
      'Olá! Podemos combinar envio por carta registrada?'
    );
    assert.equal(
      fullHistory.json().messages[1].content,
      'Combinado! Frete fica R$ 15 via PIX.'
    );

    // Polling incremental após a primeira mensagem retorna apenas a segunda
    const incremental = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/chat/messages?after=${encodeURIComponent(
        firstMsg.createdAt
      )}&afterId=${encodeURIComponent(firstMsg.id)}`,
      headers: { authorization: `Bearer ${buyer.token}` },
    });
    assert.equal(incremental.statusCode, 200);
    assert.equal(incremental.json().messages.length, 1);
    assert.equal(
      incremental.json().messages[0].content,
      'Combinado! Frete fica R$ 15 via PIX.'
    );
  });

  it('libera sala de chat após aceite de proposta e isola negociações distintas bloqueando terceiros', async () => {
    const sellerA = await registerAndLogin('Vendedor A', 'sellera@chat.test');
    const buyerA = await registerAndLogin('Comprador A', 'buyera@chat.test');
    const sellerB = await registerAndLogin('Vendedor B', 'sellerb@chat.test');
    const buyerB = await registerAndLogin('Comprador B', 'buyerb@chat.test');
    const stranger = await registerAndLogin('Intruso', 'stranger@chat.test');

    // Negociação A via Proposta
    const listingA = await createProposalListing(sellerA.token, sellerA.user.id);
    const propRes = await app.inject({
      method: 'POST',
      url: `/listings/${listingA.id}/proposals`,
      headers: { authorization: `Bearer ${buyerA.token}` },
      payload: { amountInCents: 14000 },
    });
    assert.equal(propRes.statusCode, 201);

    const acceptRes = await app.inject({
      method: 'POST',
      url: `/proposals/${propRes.json().id}/accept`,
      headers: { authorization: `Bearer ${sellerA.token}` },
    });
    assert.equal(acceptRes.statusCode, 200);
    assert.ok(acceptRes.json().chatRoomId);
    const orderAId = acceptRes.json().id as string;

    // Negociação B via Preço Fixo
    const listingB = await createFixedListing(sellerB.token, sellerB.user.id);
    const reserveB = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${buyerB.token}` },
      payload: { listingId: listingB.id },
    });
    const orderBId = reserveB.json().id as string;
    await app.inject({
      method: 'POST',
      url: `/orders/${orderBId}/confirm`,
      headers: { authorization: `Bearer ${sellerB.token}` },
    });

    // Mensagens enviadas na Sala A e Sala B
    const msgARes = await app.inject({
      method: 'POST',
      url: `/orders/${orderAId}/chat/messages`,
      headers: { authorization: `Bearer ${buyerA.token}` },
      payload: { content: 'Segredo da negociação A' },
    });
    assert.equal(msgARes.statusCode, 201);

    const msgBRes = await app.inject({
      method: 'POST',
      url: `/orders/${orderBId}/chat/messages`,
      headers: { authorization: `Bearer ${buyerB.token}` },
      payload: { content: 'Segredo da negociação B' },
    });
    assert.equal(msgBRes.statusCode, 201);

    // Isolamento: Sala A só retorna mensagens da Sala A
    const readA = await app.inject({
      method: 'GET',
      url: `/orders/${orderAId}/chat/messages`,
      headers: { authorization: `Bearer ${sellerA.token}` },
    });
    assert.equal(readA.statusCode, 200);
    assert.equal(readA.json().messages.length, 1);
    assert.equal(readA.json().messages[0].content, 'Segredo da negociação A');

    // Visitante anônimo recebe 401
    const anonRead = await app.inject({
      method: 'GET',
      url: `/orders/${orderAId}/chat/messages`,
    });
    assert.equal(anonRead.statusCode, 401);

    // Usuário terceiro e participantes da outra negociação recebem 403 em leitura, envio e marcação de leitura
    for (const outsiderToken of [stranger.token, buyerB.token, sellerB.token]) {
      assert.equal(
        (
          await app.inject({
            method: 'GET',
            url: `/orders/${orderAId}/chat/messages`,
            headers: { authorization: `Bearer ${outsiderToken}` },
          })
        ).statusCode,
        403
      );
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: `/orders/${orderAId}/chat/messages`,
            headers: { authorization: `Bearer ${outsiderToken}` },
            payload: { content: 'Tentativa indevida' },
          })
        ).statusCode,
        403
      );
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: `/orders/${orderAId}/chat/read`,
            headers: { authorization: `Bearer ${outsiderToken}` },
          })
        ).statusCode,
        403
      );
    }
  });

  it('atualiza indicadores in-app de mensagens não lidas e alertas de alteração de estado', async () => {
    const seller = await registerAndLogin('Brock', 'brock@chat.test');
    const buyer = await registerAndLogin('Dawn', 'dawn@chat.test');
    const listing = await createFixedListing(seller.token, seller.user.id);

    const reserveRes = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${buyer.token}` },
      payload: { listingId: listing.id },
    });
    const orderId = reserveRes.json().id as string;

    // Vendedor recebe alerta ORDER_RESERVED
    const sellerAfterReserve = await app.inject({
      method: 'GET',
      url: '/chat/indicators',
      headers: { authorization: `Bearer ${seller.token}` },
    });
    assert.equal(sellerAfterReserve.statusCode, 200);
    assert.equal(sellerAfterReserve.json().unreadStatusAlertsCount, 1);
    assert.equal(sellerAfterReserve.json().alerts[0].type, 'ORDER_RESERVED');

    // Vendedor confirma -> comprador recebe alerta ORDER_CONFIRMED
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/confirm`,
      headers: { authorization: `Bearer ${seller.token}` },
    });

    // Vendedor envia 2 mensagens no chat
    const msg1Res = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/chat/messages`,
      headers: { authorization: `Bearer ${seller.token}` },
      payload: { content: 'Oi Dawn, carta separada!' },
    });
    assert.equal(msg1Res.statusCode, 201);

    const msg2Res = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/chat/messages`,
      headers: { authorization: `Bearer ${seller.token}` },
      payload: { content: 'Qual seu CEP?' },
    });
    assert.equal(msg2Res.statusCode, 201);

    // Comprador vê 2 mensagens não lidas + 1 alerta ORDER_CONFIRMED = badge 3
    const buyerIndicators = await app.inject({
      method: 'GET',
      url: '/chat/indicators',
      headers: { authorization: `Bearer ${buyer.token}` },
    });
    assert.equal(buyerIndicators.statusCode, 200);
    assert.equal(buyerIndicators.json().unreadMessagesCount, 2);
    assert.equal(buyerIndicators.json().unreadStatusAlertsCount, 1);
    assert.equal(buyerIndicators.json().totalBadgeCount, 3);
    assert.equal(buyerIndicators.json().unreadByOrder.length, 1);
    assert.equal(buyerIndicators.json().unreadByOrder[0].orderId, orderId);

    // Ao marcar a sala como lida, zera mensagens não lidas e alertas vinculados à order
    const markReadRes = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/chat/read`,
      headers: { authorization: `Bearer ${buyer.token}` },
    });
    assert.equal(markReadRes.statusCode, 200);

    const buyerAfterRead = await app.inject({
      method: 'GET',
      url: '/chat/indicators',
      headers: { authorization: `Bearer ${buyer.token}` },
    });
    assert.equal(buyerAfterRead.statusCode, 200);
    assert.equal(buyerAfterRead.json().unreadMessagesCount, 0);
    assert.equal(buyerAfterRead.json().unreadStatusAlertsCount, 0);
    assert.equal(buyerAfterRead.json().totalBadgeCount, 0);
  });

  it('retorna 409 ao tentar enviar mensagem em negociação encerrada', async () => {
    const seller = await registerAndLogin('Erika', 'erika@chat.test');
    const buyer = await registerAndLogin('May', 'may@chat.test');
    const listing = await createFixedListing(seller.token, seller.user.id);

    const reserveRes = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${buyer.token}` },
      payload: { listingId: listing.id },
    });
    const orderId = reserveRes.json().id as string;
    await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/confirm`,
      headers: { authorization: `Bearer ${seller.token}` },
    });

    // Encerra a negociação diretamente para simular estado VENDIDO
    if (usePostgresTestDb) {
      const { prisma } = await import('@pokeshop/database');
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'VENDIDO', soldAt: new Date() },
      });
    } else {
      const order = testOrders.find((o) => o.id === orderId)!;
      order.status = 'VENDIDO';
      const room = testChatRooms.find((r) => r.orderId === orderId)!;
      room.status = 'VENDIDO';
    }

    const writeClosed = await app.inject({
      method: 'POST',
      url: `/orders/${orderId}/chat/messages`,
      headers: { authorization: `Bearer ${buyer.token}` },
      payload: { content: 'Mensagem após conclusão' },
    });
    assert.equal(writeClosed.statusCode, 409);

    const readClosed = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/chat/messages`,
      headers: { authorization: `Bearer ${buyer.token}` },
    });
    assert.equal(readClosed.statusCode, 200);
  });
});
