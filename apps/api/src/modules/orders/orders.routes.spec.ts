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
import type {
  OrdersRepository,
  StoredOrderRecord,
} from './orders.repository.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/pokeshop_test?schema=public';

process.env.DATABASE_URL = TEST_DATABASE_URL;

function formatBirthDateForAge(yearsOld: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - yearsOld);
  return date.toISOString().slice(0, 10);
}

describe('Rotas HTTP de reserva e confirmação por preço fixo (/orders)', () => {
  let app: FastifyInstance;
  let cardId: string;
  let usePostgresTestDb = false;

  const testUsers: StoredUserRecord[] = [];
  const testCards: StoredCardSummary[] = [];
  const testListings: StoredListingRecord[] = [];
  const testOrders: StoredOrderRecord[] = [];
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

      listing.status = 'NEGOCIACAO_ABERTA';
      listing.updatedAt = now;
      order.status = 'NEGOCIACAO_ABERTA';
      order.confirmedAt = now;
      order.updatedAt = now;
      order.chatRoom = { id: randomUUID() };
      order.listing.status = 'NEGOCIACAO_ABERTA';
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
      return order;
    },
    async findExpiredPendingOrderIds(cutoffDate) {
      return testOrders
        .filter(
          (o) =>
            o.status === 'AGUARDANDO_CONFIRMACAO' &&
            o.createdAt.getTime() <= cutoffDate.getTime()
        )
        .map((o) => o.id);
    },
    async expireOrderAtomically(orderId, now) {
      const order = testOrders.find((o) => o.id === orderId);
      if (!order || order.status !== 'AGUARDANDO_CONFIRMACAO') return false;

      const listing = testListings.find((l) => l.id === order.listingId);
      if (!listing || listing.status !== 'AGUARDANDO_CONFIRMACAO') return false;

      listing.status = 'DISPONIVEL';
      listing.updatedAt = now;
      order.status = 'CANCELADO';
      order.cancelledAt = now;
      order.updatedAt = now;
      order.listing.status = 'DISPONIVEL';
      return true;
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
            listings: {
              s3Storage: fakeS3Storage,
            },
          }
        : {
            auth: {
              authRepository: fallbackAuthRepo,
            },
            listings: {
              listingsRepository: fallbackListingsRepo,
              s3Storage: fakeS3Storage,
            },
            orders: {
              ordersRepository: fallbackOrdersRepo,
            },
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

  async function createListingAs(sellerToken: string, sellerId: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { authorization: `Bearer ${sellerToken}` },
      payload: {
        cardId,
        saleType: 'PRECO_FIXO',
        priceInCents: 29990,
        condition: 'PERFEITO_ESTADO',
        language: 'PT-BR',
        edition: 'Full Art',
        photoKeys: [`listings/${sellerId}/frente.jpg`],
      },
    });
    assert.equal(res.statusCode, 201);
    return res.json() as { id: string; status: string };
  }

  it('POST /orders bloqueia o Exemplar em AGUARDANDO_CONFIRMACAO, oculta da vitrine e restringe activeOrder às partes', async () => {
    const seller = await registerAndLogin('Misty Waterflower', 'misty@pokeshop.br');
    const buyer = await registerAndLogin('Ash Ketchum', 'ash@pokeshop.br');
    const stranger = await registerAndLogin('Gary Oak', 'gary@pokeshop.br');

    const listing = await createListingAs(seller.token, seller.user.id);

    const anonRes = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { listingId: listing.id },
    });
    assert.equal(anonRes.statusCode, 401);

    const reserveRes = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${buyer.token}` },
      payload: { listingId: listing.id },
    });
    assert.equal(reserveRes.statusCode, 201);
    const createdOrder = reserveRes.json();
    assert.equal(createdOrder.status, 'AGUARDANDO_CONFIRMACAO');
    assert.equal(createdOrder.listing.status, 'AGUARDANDO_CONFIRMACAO');
    assert.ok(createdOrder.expiresAt);

    // Anúncio sai da vitrine de disponíveis
    const availableList = await app.inject({
      method: 'GET',
      url: `/listings?cardId=${cardId}`,
    });
    assert.equal(availableList.statusCode, 200);
    assert.equal(availableList.json().items.length, 0);

    // Visitante e terceiro não recebem activeOrder; comprador e vendedor recebem
    const anonDetail = await app.inject({
      method: 'GET',
      url: `/listings/${listing.id}`,
    });
    assert.equal(anonDetail.json().status, 'AGUARDANDO_CONFIRMACAO');
    assert.equal(anonDetail.json().activeOrder, null);

    const strangerDetail = await app.inject({
      method: 'GET',
      url: `/listings/${listing.id}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    assert.equal(strangerDetail.json().activeOrder, null);

    const sellerDetail = await app.inject({
      method: 'GET',
      url: `/listings/${listing.id}`,
      headers: { authorization: `Bearer ${seller.token}` },
    });
    assert.equal(sellerDetail.json().activeOrder.id, createdOrder.id);
    assert.equal(sellerDetail.json().activeOrder.buyerName, 'Ash Ketchum');

    const buyerDetail = await app.inject({
      method: 'GET',
      url: `/listings/${listing.id}`,
      headers: { authorization: `Bearer ${buyer.token}` },
    });
    assert.equal(buyerDetail.json().activeOrder.id, createdOrder.id);

    // Vendedor não consegue excluir anúncio reservado via DELETE enquanto AGUARDANDO_CONFIRMACAO
    const deleteWhileReserved = await app.inject({
      method: 'DELETE',
      url: `/listings/${listing.id}`,
      headers: { authorization: `Bearer ${seller.token}` },
    });
    assert.equal(deleteWhileReserved.statusCode, 409);
  });

  it('Concorrência HTTP: múltiplos compradores simultâneos disputando o mesmo Exemplar permitem apenas 1 reserva', async () => {
    const seller = await registerAndLogin('Brock Harrison', 'brock@pokeshop.br');
    const listing = await createListingAs(seller.token, seller.user.id);

    const buyers = await Promise.all([
      registerAndLogin('Comprador 1', 'buyer1@pokeshop.br'),
      registerAndLogin('Comprador 2', 'buyer2@pokeshop.br'),
      registerAndLogin('Comprador 3', 'buyer3@pokeshop.br'),
      registerAndLogin('Comprador 4', 'buyer4@pokeshop.br'),
      registerAndLogin('Comprador 5', 'buyer5@pokeshop.br'),
    ]);

    const responses = await Promise.all(
      buyers.map((buyer) =>
        app.inject({
          method: 'POST',
          url: '/orders',
          headers: { authorization: `Bearer ${buyer.token}` },
          payload: { listingId: listing.id },
        })
      )
    );

    const createdResponses = responses.filter((res) => res.statusCode === 201);
    const conflictResponses = responses.filter((res) => res.statusCode === 409);

    assert.equal(createdResponses.length, 1);
    assert.equal(conflictResponses.length, 4);

    if (usePostgresTestDb) {
      const { prisma } = await import('@pokeshop/database');
      const activeOrdersInDb = await prisma.order.count({
        where: {
          listingId: listing.id,
          status: 'AGUARDANDO_CONFIRMACAO',
        },
      });
      assert.equal(activeOrdersInDb, 1);
    }
  });

  it('Comprador não pode cancelar após reservar (403); vendedor pode recusar (volta a DISPONIVEL) ou confirmar (NEGOCIACAO_ABERTA)', async () => {
    const seller = await registerAndLogin('Erika Celadon', 'erika@pokeshop.br');
    const firstBuyer = await registerAndLogin('Dawn Sinnoh', 'dawn@pokeshop.br');
    const secondBuyer = await registerAndLogin('May Hoenn', 'may@pokeshop.br');

    const listing = await createListingAs(seller.token, seller.user.id);

    const firstReserve = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${firstBuyer.token}` },
      payload: { listingId: listing.id },
    });
    assert.equal(firstReserve.statusCode, 201);
    const firstOrderId = firstReserve.json().id as string;

    // Comprador tenta cancelar/recusar após reservar -> 403 Forbidden
    const buyerCancelAttempt = await app.inject({
      method: 'POST',
      url: `/orders/${firstOrderId}/decline`,
      headers: { authorization: `Bearer ${firstBuyer.token}` },
    });
    assert.equal(buyerCancelAttempt.statusCode, 403);

    // Vendedor recusa -> Order CANCELADO e anúncio retorna a DISPONIVEL
    const declineRes = await app.inject({
      method: 'POST',
      url: `/orders/${firstOrderId}/decline`,
      headers: { authorization: `Bearer ${seller.token}` },
    });
    assert.equal(declineRes.statusCode, 200);
    assert.equal(declineRes.json().status, 'CANCELADO');
    assert.equal(declineRes.json().listing.status, 'DISPONIVEL');
    assert.ok(declineRes.json().cancelledAt);

    // Novo comprador consegue reservar o mesmo Exemplar depois da recusa
    const secondReserve = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${secondBuyer.token}` },
      payload: { listingId: listing.id },
    });
    assert.equal(secondReserve.statusCode, 201);
    const secondOrderId = secondReserve.json().id as string;

    // Vendedor confirma disponibilidade -> NEGOCIACAO_ABERTA e ChatRoom criada
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/orders/${secondOrderId}/confirm`,
      headers: { authorization: `Bearer ${seller.token}` },
    });
    assert.equal(confirmRes.statusCode, 200);
    assert.equal(confirmRes.json().status, 'NEGOCIACAO_ABERTA');
    assert.equal(confirmRes.json().listing.status, 'NEGOCIACAO_ABERTA');
    assert.ok(confirmRes.json().confirmedAt);
    assert.ok(confirmRes.json().chatRoomId);

    // Listagem por papel (buyer vs seller) retorna o histórico esperado
    const sellerList = await app.inject({
      method: 'GET',
      url: '/orders?role=seller',
      headers: { authorization: `Bearer ${seller.token}` },
    });
    assert.equal(sellerList.statusCode, 200);
    assert.equal(sellerList.json().items.length, 2);

    const secondBuyerList = await app.inject({
      method: 'GET',
      url: '/orders?role=buyer',
      headers: { authorization: `Bearer ${secondBuyer.token}` },
    });
    assert.equal(secondBuyerList.statusCode, 200);
    assert.equal(secondBuyerList.json().items.length, 1);
    assert.equal(secondBuyerList.json().items[0].id, secondOrderId);
  });
});
