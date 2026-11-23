import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type {
  OrdersRepository,
  StoredOrderListingSnapshot,
  StoredOrderRecord,
} from './orders.repository.js';
import {
  confirmFixedPriceReservation,
  declineFixedPriceReservation,
  getOrderDetails,
  listUserOrders,
  OrderError,
  reserveFixedPriceListing,
} from './orders.service.js';

function createFakeOrdersRepository(seed?: {
  listings?: StoredOrderListingSnapshot[];
  orders?: StoredOrderRecord[];
  users?: Record<string, string>;
  simulateRaceConflict?: boolean;
}): OrdersRepository & {
  listings: StoredOrderListingSnapshot[];
  orders: StoredOrderRecord[];
} {
  const listings = [...(seed?.listings ?? [])];
  const orders = [...(seed?.orders ?? [])];
  const users = { ...(seed?.users ?? {}) };

  return {
    listings,
    orders,

    async findListingForReservation(listingId) {
      return listings.find((item) => item.id === listingId) ?? null;
    },

    async reserveListingAtomically(input) {
      if (seed?.simulateRaceConflict) {
        return null;
      }

      const listing = listings.find((item) => item.id === input.listingId);
      if (
        !listing ||
        listing.status !== 'DISPONIVEL' ||
        listing.saleType !== 'PRECO_FIXO'
      ) {
        return null;
      }

      listing.status = 'AGUARDANDO_CONFIRMACAO';

      const order: StoredOrderRecord = {
        id: randomUUID(),
        listingId: listing.id,
        buyerId: input.buyerId,
        sellerId: input.sellerId,
        status: 'AGUARDANDO_CONFIRMACAO',
        confirmedAt: null,
        soldAt: null,
        cancelledAt: null,
        createdAt: input.now,
        updatedAt: input.now,
        buyer: {
          id: input.buyerId,
          name: users[input.buyerId] ?? 'Comprador Teste',
        },
        seller: {
          id: input.sellerId,
          name: users[input.sellerId] ?? 'Vendedor Teste',
        },
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

      orders.push(order);
      return order;
    },

    async findOrderById(orderId) {
      return orders.find((item) => item.id === orderId) ?? null;
    },

    async findOrdersByUser(filter) {
      return orders
        .filter((item) => {
          if (filter.role === 'buyer' && item.buyerId !== filter.userId) return false;
          if (filter.role === 'seller' && item.sellerId !== filter.userId) return false;
          if (
            filter.role === 'all' &&
            item.buyerId !== filter.userId &&
            item.sellerId !== filter.userId
          ) {
            return false;
          }
          if (filter.status && item.status !== filter.status) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async confirmOrderAtomically(orderId, now) {
      const order = orders.find((item) => item.id === orderId);
      if (!order || order.status !== 'AGUARDANDO_CONFIRMACAO') {
        return null;
      }

      const listing = listings.find((item) => item.id === order.listingId);
      if (!listing || listing.status !== 'AGUARDANDO_CONFIRMACAO') {
        return null;
      }

      listing.status = 'NEGOCIACAO_ABERTA';
      order.status = 'NEGOCIACAO_ABERTA';
      order.confirmedAt = now;
      order.updatedAt = now;
      order.chatRoom = { id: randomUUID() };
      order.listing.status = 'NEGOCIACAO_ABERTA';

      return order;
    },

    async declineOrderAtomically(orderId, now) {
      const order = orders.find((item) => item.id === orderId);
      if (!order || order.status !== 'AGUARDANDO_CONFIRMACAO') {
        return null;
      }

      const listing = listings.find((item) => item.id === order.listingId);
      if (!listing || listing.status !== 'AGUARDANDO_CONFIRMACAO') {
        return null;
      }

      listing.status = 'DISPONIVEL';
      order.status = 'CANCELADO';
      order.cancelledAt = now;
      order.updatedAt = now;
      order.listing.status = 'DISPONIVEL';

      return order;
    },

    async findExpiredPendingOrderIds(cutoffDate) {
      return orders
        .filter(
          (item) =>
            item.status === 'AGUARDANDO_CONFIRMACAO' &&
            item.createdAt.getTime() <= cutoffDate.getTime()
        )
        .map((item) => item.id);
    },

    async expireOrderAtomically(orderId, now) {
      const order = orders.find((item) => item.id === orderId);
      if (!order || order.status !== 'AGUARDANDO_CONFIRMACAO') {
        return false;
      }

      const listing = listings.find((item) => item.id === order.listingId);
      if (!listing || listing.status !== 'AGUARDANDO_CONFIRMACAO') {
        return false;
      }

      listing.status = 'DISPONIVEL';
      order.status = 'CANCELADO';
      order.cancelledAt = now;
      order.updatedAt = now;
      order.listing.status = 'DISPONIVEL';
      return true;
    },
  };
}

describe('Serviço de pedidos/reservas (orders.service)', () => {
  const sellerId = randomUUID();
  const buyerId = randomUUID();
  const strangerId = randomUUID();

  function createSampleListing(
    overrides?: Partial<StoredOrderListingSnapshot>
  ): StoredOrderListingSnapshot {
    return {
      id: randomUUID(),
      sellerId,
      saleType: 'PRECO_FIXO',
      priceInCents: 18500,
      condition: 'PERFEITO_ESTADO',
      language: 'PT-BR',
      edition: 'Foil',
      status: 'DISPONIVEL',
      sellerProfileVisibility: 'PUBLIC',
      card: {
        id: randomUUID(),
        tcgdexId: 'sv01-25',
        name: 'Pikachu',
        setName: 'Escarlate e Violeta',
        cardNumber: '25',
        rarity: 'Common',
        imageUrl: 'https://assets.tcgdex.net/pt/sv/sv01/25',
      },
      ...overrides,
    };
  }

  function createPendingOrder(listing: StoredOrderListingSnapshot, createdAt: Date): StoredOrderRecord {
    listing.status = 'AGUARDANDO_CONFIRMACAO';
    return {
      id: randomUUID(),
      listingId: listing.id,
      buyerId,
      sellerId: listing.sellerId,
      status: 'AGUARDANDO_CONFIRMACAO',
      confirmedAt: null,
      soldAt: null,
      cancelledAt: null,
      createdAt,
      updatedAt: createdAt,
      buyer: { id: buyerId, name: 'Ash' },
      seller: { id: listing.sellerId, name: 'Misty' },
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
  }

  it('reserveFixedPriceListing cria reserva AGUARDANDO_CONFIRMACAO com prazo de 30 dias usando o clock', async () => {
    const listing = createSampleListing();
    const repo = createFakeOrdersRepository({
      listings: [listing],
      users: { [sellerId]: 'Misty', [buyerId]: 'Ash' },
    });
    const fixedNow = new Date('2026-11-01T12:00:00.000Z');

    const order = await reserveFixedPriceListing(listing.id, buyerId, repo, () => fixedNow);

    assert.equal(order.listingId, listing.id);
    assert.equal(order.buyerId, buyerId);
    assert.equal(order.sellerId, sellerId);
    assert.equal(order.status, 'AGUARDANDO_CONFIRMACAO');
    assert.equal(order.createdAt, '2026-11-01T12:00:00.000Z');
    assert.equal(order.expiresAt, '2026-12-01T12:00:00.000Z');
    assert.equal(listing.status, 'AGUARDANDO_CONFIRMACAO');
  });

  it('reserveFixedPriceListing rejeita anúncio inexistente (404), autocompra (403), privado (403) e modalidade PROPOSTAS (400)', async () => {
    const privateListing = createSampleListing({ sellerProfileVisibility: 'PRIVATE' });
    const proposalsListing = createSampleListing({ saleType: 'PROPOSTAS' });
    const validListing = createSampleListing();

    const repo = createFakeOrdersRepository({
      listings: [privateListing, proposalsListing, validListing],
    });

    await assert.rejects(
      () => reserveFixedPriceListing(randomUUID(), buyerId, repo),
      (err: unknown) => err instanceof OrderError && err.statusCode === 404
    );

    await assert.rejects(
      () => reserveFixedPriceListing(validListing.id, sellerId, repo),
      (err: unknown) => err instanceof OrderError && err.statusCode === 403
    );

    await assert.rejects(
      () => reserveFixedPriceListing(privateListing.id, buyerId, repo),
      (err: unknown) => err instanceof OrderError && err.statusCode === 403
    );

    await assert.rejects(
      () => reserveFixedPriceListing(proposalsListing.id, buyerId, repo),
      (err: unknown) => err instanceof OrderError && err.statusCode === 400
    );
  });

  it('reserveFixedPriceListing retorna 409 se anúncio não estiver DISPONIVEL ou se perder corrida atômica (TOCTOU)', async () => {
    const reservedListing = createSampleListing({ status: 'AGUARDANDO_CONFIRMACAO' });
    const soldListing = createSampleListing({ status: 'VENDIDO' });
    const cancelledListing = createSampleListing({ status: 'CANCELADO' });
    const raceListing = createSampleListing({ status: 'DISPONIVEL' });

    const repo = createFakeOrdersRepository({
      listings: [reservedListing, soldListing, cancelledListing],
    });

    for (const item of [reservedListing, soldListing, cancelledListing]) {
      await assert.rejects(
        () => reserveFixedPriceListing(item.id, buyerId, repo),
        (err: unknown) => err instanceof OrderError && err.statusCode === 409
      );
    }

    const raceRepo = createFakeOrdersRepository({
      listings: [raceListing],
      simulateRaceConflict: true,
    });

    await assert.rejects(
      () => reserveFixedPriceListing(raceListing.id, buyerId, raceRepo),
      (err: unknown) => err instanceof OrderError && err.statusCode === 409
    );
  });

  it('confirmFixedPriceReservation permite apenas ao vendedor confirmar, abrindo NEGOCIACAO_ABERTA e ChatRoom', async () => {
    const listing = createSampleListing();
    const order = createPendingOrder(listing, new Date('2026-11-01T10:00:00.000Z'));
    const repo = createFakeOrdersRepository({ listings: [listing], orders: [order] });
    const confirmNow = new Date('2026-11-02T15:30:00.000Z');

    await assert.rejects(
      () => confirmFixedPriceReservation(order.id, buyerId, repo, () => confirmNow),
      (err: unknown) => err instanceof OrderError && err.statusCode === 403
    );

    await assert.rejects(
      () => confirmFixedPriceReservation(order.id, strangerId, repo, () => confirmNow),
      (err: unknown) => err instanceof OrderError && err.statusCode === 403
    );

    const confirmed = await confirmFixedPriceReservation(
      order.id,
      sellerId,
      repo,
      () => confirmNow
    );

    assert.equal(confirmed.status, 'NEGOCIACAO_ABERTA');
    assert.equal(confirmed.confirmedAt, '2026-11-02T15:30:00.000Z');
    assert.equal(confirmed.expiresAt, null);
    assert.ok(confirmed.chatRoomId);
    assert.equal(listing.status, 'NEGOCIACAO_ABERTA');

    await assert.rejects(
      () => confirmFixedPriceReservation(order.id, sellerId, repo, () => confirmNow),
      (err: unknown) => err instanceof OrderError && err.statusCode === 409
    );
  });

  it('declineFixedPriceReservation bloqueia cancelamento pelo comprador (403) e permite ao vendedor devolver o anúncio a DISPONIVEL', async () => {
    const listing = createSampleListing();
    const order = createPendingOrder(listing, new Date('2026-11-01T10:00:00.000Z'));
    const repo = createFakeOrdersRepository({ listings: [listing], orders: [order] });
    const declineNow = new Date('2026-11-03T09:00:00.000Z');

    await assert.rejects(
      () => declineFixedPriceReservation(order.id, buyerId, repo, () => declineNow),
      (err: unknown) =>
        err instanceof OrderError &&
        err.statusCode === 403 &&
        err.message.toLowerCase().includes('comprador')
    );

    await assert.rejects(
      () => declineFixedPriceReservation(order.id, strangerId, repo, () => declineNow),
      (err: unknown) => err instanceof OrderError && err.statusCode === 403
    );

    const declined = await declineFixedPriceReservation(
      order.id,
      sellerId,
      repo,
      () => declineNow
    );

    assert.equal(declined.status, 'CANCELADO');
    assert.equal(declined.cancelledAt, '2026-11-03T09:00:00.000Z');
    assert.equal(listing.status, 'DISPONIVEL');
  });

  it('getOrderDetails e listUserOrders restringem acesso aos participantes da negociação', async () => {
    const listing = createSampleListing();
    const order = createPendingOrder(listing, new Date('2026-11-01T10:00:00.000Z'));
    const repo = createFakeOrdersRepository({ listings: [listing], orders: [order] });

    await assert.rejects(
      () => getOrderDetails(order.id, strangerId, repo),
      (err: unknown) => err instanceof OrderError && err.statusCode === 403
    );

    const buyerView = await getOrderDetails(order.id, buyerId, repo);
    assert.equal(buyerView.id, order.id);

    const sellerOrders = await listUserOrders(sellerId, { role: 'seller' }, repo);
    assert.equal(sellerOrders.length, 1);

    const strangerOrders = await listUserOrders(strangerId, { role: 'all' }, repo);
    assert.equal(strangerOrders.length, 0);
  });
});
