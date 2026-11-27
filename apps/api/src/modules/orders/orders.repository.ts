import type { PrismaClient } from '@pokeshop/database';
import type { CardConditionType, ListingSaleType, OrderStatusType } from '@pokeshop/shared';
import type { StoredCardSummary } from '../listings/listings.repository.js';

export type Clock = () => Date;

export type StoredOrderParticipant = {
  id: string;
  name: string;
};

export type StoredOrderListingSnapshot = {
  id: string;
  sellerId: string;
  saleType: ListingSaleType;
  priceInCents: number;
  condition: CardConditionType;
  language: string;
  edition: string | null;
  status: OrderStatusType;
  sellerProfileVisibility: 'PUBLIC' | 'PRIVATE';
  card: StoredCardSummary;
};

export type StoredOrderRecord = {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status: OrderStatusType;
  confirmedAt: Date | null;
  soldAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  buyer: StoredOrderParticipant;
  seller: StoredOrderParticipant;
  chatRoom: { id: string } | null;
  listing: {
    id: string;
    saleType: ListingSaleType;
    priceInCents: number;
    condition: CardConditionType;
    language: string;
    edition: string | null;
    status: OrderStatusType;
    card: StoredCardSummary;
  };
};

export type ReserveListingInput = {
  listingId: string;
  buyerId: string;
  sellerId: string;
  now: Date;
};

export type FindUserOrdersFilter = {
  userId: string;
  role: 'all' | 'buyer' | 'seller';
  status?: OrderStatusType;
};

export interface OrdersRepository {
  findListingForReservation(listingId: string): Promise<StoredOrderListingSnapshot | null>;
  reserveListingAtomically(input: ReserveListingInput): Promise<StoredOrderRecord | null>;
  findOrderById(orderId: string): Promise<StoredOrderRecord | null>;
  findOrdersByUser(filter: FindUserOrdersFilter): Promise<StoredOrderRecord[]>;
  confirmOrderAtomically(orderId: string, now: Date): Promise<StoredOrderRecord | null>;
  declineOrderAtomically(orderId: string, now: Date): Promise<StoredOrderRecord | null>;
  findExpiredPendingOrderIds(cutoffDate: Date): Promise<string[]>;
  expireOrderAtomically(orderId: string, now: Date): Promise<boolean>;
}

class ConflictRollbackError extends Error {
  constructor() {
    super('CONFLICT_ROLLBACK');
    this.name = 'ConflictRollbackError';
  }
}

const cardSelect = {
  id: true,
  tcgdexId: true,
  name: true,
  setName: true,
  cardNumber: true,
  rarity: true,
  imageUrl: true,
} as const;

const orderInclude = {
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
  chatRoom: {
    select: {
      id: true,
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
        select: cardSelect,
      },
    },
  },
} as const;

export function createPrismaOrdersRepository(prisma: PrismaClient): OrdersRepository {
  return {
    async findListingForReservation(
      listingId: string
    ): Promise<StoredOrderListingSnapshot | null> {
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: {
          seller: {
            select: {
              id: true,
              profileVisibility: true,
            },
          },
          card: {
            select: cardSelect,
          },
        },
      });

      if (!listing) {
        return null;
      }

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

    async reserveListingAtomically(
      input: ReserveListingInput
    ): Promise<StoredOrderRecord | null> {
      return prisma.$transaction(async (tx) => {
        // Update condicional atômico evita corrida TOCTOU quando dois compradores tentam reservar ao mesmo tempo
        const updated = await tx.listing.updateMany({
          where: {
            id: input.listingId,
            status: 'DISPONIVEL',
            saleType: 'PRECO_FIXO',
          },
          data: {
            status: 'AGUARDANDO_CONFIRMACAO',
            updatedAt: input.now,
          },
        });

        if (updated.count === 0) {
          return null;
        }

        const order = await tx.order.create({
          data: {
            listingId: input.listingId,
            buyerId: input.buyerId,
            sellerId: input.sellerId,
            status: 'AGUARDANDO_CONFIRMACAO',
            createdAt: input.now,
            updatedAt: input.now,
          },
          include: orderInclude,
        });

        await tx.notification.create({
          data: {
            userId: input.sellerId,
            orderId: order.id,
            type: 'ORDER_RESERVED',
            message: 'Você recebeu uma nova solicitação de compra por preço fixo.',
            createdAt: input.now,
          },
        });

        return order;
      });
    },

    async findOrderById(orderId: string): Promise<StoredOrderRecord | null> {
      return prisma.order.findUnique({
        where: { id: orderId },
        include: orderInclude,
      });
    },

    async findOrdersByUser(filter: FindUserOrdersFilter): Promise<StoredOrderRecord[]> {
      const roleFilter =
        filter.role === 'buyer'
          ? { buyerId: filter.userId }
          : filter.role === 'seller'
            ? { sellerId: filter.userId }
            : {
                OR: [{ buyerId: filter.userId }, { sellerId: filter.userId }],
              };

      return prisma.order.findMany({
        where: {
          ...roleFilter,
          ...(filter.status ? { status: filter.status } : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        include: orderInclude,
      });
    },

    async confirmOrderAtomically(
      orderId: string,
      now: Date
    ): Promise<StoredOrderRecord | null> {
      try {
        return await prisma.$transaction(async (tx) => {
          const existing = await tx.order.findUnique({
            where: { id: orderId },
            select: {
              id: true,
              listingId: true,
              buyerId: true,
              status: true,
            },
          });

          if (!existing || existing.status !== 'AGUARDANDO_CONFIRMACAO') {
            return null;
          }

          const updatedOrder = await tx.order.updateMany({
            where: {
              id: orderId,
              status: 'AGUARDANDO_CONFIRMACAO',
            },
            data: {
              status: 'NEGOCIACAO_ABERTA',
              confirmedAt: now,
              updatedAt: now,
            },
          });

          if (updatedOrder.count === 0) {
            return null;
          }

          const updatedListing = await tx.listing.updateMany({
            where: {
              id: existing.listingId,
              status: 'AGUARDANDO_CONFIRMACAO',
            },
            data: {
              status: 'NEGOCIACAO_ABERTA',
              updatedAt: now,
            },
          });

          if (updatedListing.count === 0) {
            throw new ConflictRollbackError();
          }

          await tx.chatRoom.create({
            data: {
              orderId,
              lastMessageAt: now,
              createdAt: now,
              updatedAt: now,
            },
          });

          await tx.notification.create({
            data: {
              userId: existing.buyerId,
              orderId,
              type: 'ORDER_CONFIRMED',
              message:
                'Disponibilidade confirmada! O chat da negociação já está aberto.',
              createdAt: now,
            },
          });

          return tx.order.findUnique({
            where: { id: orderId },
            include: orderInclude,
          });
        });
      } catch (error) {
        if (error instanceof ConflictRollbackError) {
          return null;
        }
        throw error;
      }
    },

    async declineOrderAtomically(
      orderId: string,
      now: Date
    ): Promise<StoredOrderRecord | null> {
      try {
        return await prisma.$transaction(async (tx) => {
          const existing = await tx.order.findUnique({
            where: { id: orderId },
            select: {
              id: true,
              listingId: true,
              buyerId: true,
              status: true,
            },
          });

          if (!existing || existing.status !== 'AGUARDANDO_CONFIRMACAO') {
            return null;
          }

          const updatedOrder = await tx.order.updateMany({
            where: {
              id: orderId,
              status: 'AGUARDANDO_CONFIRMACAO',
            },
            data: {
              status: 'CANCELADO',
              cancelledAt: now,
              updatedAt: now,
            },
          });

          if (updatedOrder.count === 0) {
            return null;
          }

          const updatedListing = await tx.listing.updateMany({
            where: {
              id: existing.listingId,
              status: 'AGUARDANDO_CONFIRMACAO',
            },
            data: {
              status: 'DISPONIVEL',
              updatedAt: now,
            },
          });

          if (updatedListing.count === 0) {
            throw new ConflictRollbackError();
          }

          await tx.notification.create({
            data: {
              userId: existing.buyerId,
              orderId,
              type: 'ORDER_DECLINED',
              message:
                'O vendedor recusou a solicitação de compra. O exemplar voltou à loja.',
              createdAt: now,
            },
          });

          return tx.order.findUnique({
            where: { id: orderId },
            include: orderInclude,
          });
        });
      } catch (error) {
        if (error instanceof ConflictRollbackError) {
          return null;
        }
        throw error;
      }
    },

    async findExpiredPendingOrderIds(cutoffDate: Date): Promise<string[]> {
      const rows = await prisma.order.findMany({
        where: {
          status: 'AGUARDANDO_CONFIRMACAO',
          createdAt: {
            lte: cutoffDate,
          },
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });

      return rows.map((row) => row.id);
    },

    async expireOrderAtomically(orderId: string, now: Date): Promise<boolean> {
      try {
        return await prisma.$transaction(async (tx) => {
          const existing = await tx.order.findUnique({
            where: { id: orderId },
            select: {
              id: true,
              listingId: true,
              status: true,
            },
          });

          if (!existing || existing.status !== 'AGUARDANDO_CONFIRMACAO') {
            return false;
          }

          const updatedOrder = await tx.order.updateMany({
            where: {
              id: orderId,
              status: 'AGUARDANDO_CONFIRMACAO',
            },
            data: {
              status: 'CANCELADO',
              cancelledAt: now,
              updatedAt: now,
            },
          });

          if (updatedOrder.count === 0) {
            return false;
          }

          const updatedListing = await tx.listing.updateMany({
            where: {
              id: existing.listingId,
              status: 'AGUARDANDO_CONFIRMACAO',
            },
            data: {
              status: 'DISPONIVEL',
              updatedAt: now,
            },
          });

          if (updatedListing.count === 0) {
            throw new ConflictRollbackError();
          }

          return true;
        });
      } catch (error) {
        if (error instanceof ConflictRollbackError) {
          return false;
        }
        throw error;
      }
    },
  };
}
