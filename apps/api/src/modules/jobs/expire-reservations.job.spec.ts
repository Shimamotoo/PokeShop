import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type {
  OrdersRepository,
  StoredOrderListingSnapshot,
  StoredOrderRecord,
} from '../orders/orders.repository.js';
import {
  confirmFixedPriceReservation,
  reserveFixedPriceListing,
} from '../orders/orders.service.js';
import {
  expirePendingFixedPriceReservations,
  type ExpireReservationsRepository,
} from './expire-reservations.job.js';

function createInMemoryOrderStore(seed: {
  listings: StoredOrderListingSnapshot[];
  users: Record<string, string>;
}): OrdersRepository & {
  listings: StoredOrderListingSnapshot[];
  orders: StoredOrderRecord[];
} {
  const listings = [...seed.listings];
  const orders: StoredOrderRecord[] = [];
  const users = { ...seed.users };

  return {
    listings,
    orders,

    async findListingForReservation(listingId) {
      return listings.find((item) => item.id === listingId) ?? null;
    },

    async reserveListingAtomically(input) {
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
        buyer: { id: input.buyerId, name: users[input.buyerId] ?? 'Comprador' },
        seller: { id: input.sellerId, name: users[input.sellerId] ?? 'Vendedor' },
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
      return orders.filter((item) => {
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
      });
    },

    async confirmOrderAtomically(orderId, now) {
      const order = orders.find((item) => item.id === orderId);
      if (!order || order.status !== 'AGUARDANDO_CONFIRMACAO') return null;

      const listing = listings.find((item) => item.id === order.listingId);
      if (!listing || listing.status !== 'AGUARDANDO_CONFIRMACAO') return null;

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
      if (!order || order.status !== 'AGUARDANDO_CONFIRMACAO') return null;

      const listing = listings.find((item) => item.id === order.listingId);
      if (!listing || listing.status !== 'AGUARDANDO_CONFIRMACAO') return null;

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
      if (!order || order.status !== 'AGUARDANDO_CONFIRMACAO') return false;

      const listing = listings.find((item) => item.id === order.listingId);
      if (!listing || listing.status !== 'AGUARDANDO_CONFIRMACAO') return false;

      listing.status = 'DISPONIVEL';
      order.status = 'CANCELADO';
      order.cancelledAt = now;
      order.updatedAt = now;
      order.listing.status = 'DISPONIVEL';
      return true;
    },
  };
}

describe('Job de expiração de reservas por preço fixo (relógio controlado)', () => {
  const sellerId = randomUUID();
  const buyerAId = randomUUID();
  const buyerBId = randomUUID();

  function createListing(): StoredOrderListingSnapshot {
    return {
      id: randomUUID(),
      sellerId,
      saleType: 'PRECO_FIXO',
      priceInCents: 15900,
      condition: 'POUCO_USADA',
      language: 'PT-BR',
      edition: null,
      status: 'DISPONIVEL',
      sellerProfileVisibility: 'PUBLIC',
      card: {
        id: randomUUID(),
        tcgdexId: 'sv01-10',
        name: 'Bulbasaur',
        setName: 'Escarlate e Violeta',
        cardNumber: '10',
        rarity: 'Common',
        imageUrl: null,
      },
    };
  }

  it('não expira antes de completar 30 dias e libera o Exemplar exatamente aos 30 dias sem apagar o anúncio', async () => {
    let currentTime = new Date('2026-11-01T12:00:00.000Z');
    const clock = () => new Date(currentTime.getTime());

    const listing = createListing();
    const store = createInMemoryOrderStore({
      listings: [listing],
      users: {
        [sellerId]: 'Vendedor',
        [buyerAId]: 'Comprador A',
        [buyerBId]: 'Comprador B',
      },
    });

    const reserved = await reserveFixedPriceListing(listing.id, buyerAId, store, clock);

    // 29 dias, 23 horas e 59 minutos depois -> ainda dentro do prazo
    currentTime = new Date('2026-12-01T11:59:00.000Z');
    const beforeTimeout = await expirePendingFixedPriceReservations(store, clock);

    assert.equal(beforeTimeout.expiredCount, 0);
    assert.deepEqual(beforeTimeout.expiredOrderIds, []);
    assert.equal(listing.status, 'AGUARDANDO_CONFIRMACAO');
    assert.equal(store.orders[0].status, 'AGUARDANDO_CONFIRMACAO');

    // Exatamente 30 dias depois -> expira e retorna anúncio a DISPONIVEL sem apagar
    currentTime = new Date('2026-12-01T12:00:00.000Z');
    const atTimeout = await expirePendingFixedPriceReservations(store, clock);

    assert.equal(atTimeout.checkedAt, '2026-12-01T12:00:00.000Z');
    assert.equal(atTimeout.cutoffAt, '2026-11-01T12:00:00.000Z');
    assert.equal(atTimeout.expiredCount, 1);
    assert.deepEqual(atTimeout.expiredOrderIds, [reserved.id]);
    assert.equal(store.listings.length, 1);
    assert.equal(listing.status, 'DISPONIVEL');
    assert.equal(store.orders[0].status, 'CANCELADO');
    assert.equal(
      store.orders[0].cancelledAt?.toISOString(),
      '2026-12-01T12:00:00.000Z'
    );

    // Outro comprador consegue reservar o mesmo Exemplar depois do timeout
    currentTime = new Date('2026-12-01T13:00:00.000Z');
    const newReservation = await reserveFixedPriceListing(
      listing.id,
      buyerBId,
      store,
      clock
    );
    assert.equal(newReservation.buyerId, buyerBId);
    assert.equal(newReservation.status, 'AGUARDANDO_CONFIRMACAO');
  });

  it('é idempotente ao rodar repetidamente no mesmo instante e nunca reverte pedido já confirmado', async () => {
    let currentTime = new Date('2026-11-01T12:00:00.000Z');
    const clock = () => new Date(currentTime.getTime());

    const listingPending = createListing();
    const listingConfirmed = createListing();
    const store = createInMemoryOrderStore({
      listings: [listingPending, listingConfirmed],
      users: {
        [sellerId]: 'Vendedor',
        [buyerAId]: 'Comprador A',
      },
    });

    const pendingOrder = await reserveFixedPriceListing(
      listingPending.id,
      buyerAId,
      store,
      clock
    );
    const confirmedOrder = await reserveFixedPriceListing(
      listingConfirmed.id,
      buyerAId,
      store,
      clock
    );

    // Vendedor confirma o segundo pedido no dia seguinte
    currentTime = new Date('2026-11-02T12:00:00.000Z');
    await confirmFixedPriceReservation(confirmedOrder.id, sellerId, store, clock);

    // 35 dias depois: apenas o pendente expira; o confirmado permanece NEGOCIACAO_ABERTA
    currentTime = new Date('2026-12-06T12:00:00.000Z');
    const firstRun = await expirePendingFixedPriceReservations(store, clock);
    assert.equal(firstRun.expiredCount, 1);
    assert.deepEqual(firstRun.expiredOrderIds, [pendingOrder.id]);
    assert.equal(listingPending.status, 'DISPONIVEL');
    assert.equal(listingConfirmed.status, 'NEGOCIACAO_ABERTA');

    // Segunda execução imediata -> idempotente (0 expirados)
    const secondRun = await expirePendingFixedPriceReservations(store, clock);
    assert.equal(secondRun.expiredCount, 0);
    assert.deepEqual(secondRun.expiredOrderIds, []);
  });

  it('não contabiliza IDs quando expireOrderAtomically retorna false por mudança concorrente', async () => {
    const orderIdA = randomUUID();
    const orderIdB = randomUUID();
    const fixedNow = new Date('2026-12-10T10:00:00.000Z');

    const racingRepo: ExpireReservationsRepository = {
      async findExpiredPendingOrderIds() {
        return [orderIdA, orderIdB];
      },
      async expireOrderAtomically(orderId) {
        // Simula que orderIdA foi confirmado pelo vendedor milissegundos antes
        return orderId === orderIdB;
      },
    };

    const result = await expirePendingFixedPriceReservations(racingRepo, () => fixedNow);

    assert.equal(result.expiredCount, 1);
    assert.deepEqual(result.expiredOrderIds, [orderIdB]);
    assert.equal(result.checkedAt, '2026-12-10T10:00:00.000Z');
    assert.equal(result.cutoffAt, '2026-11-10T10:00:00.000Z');
  });
});
