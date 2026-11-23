import {
  RESERVATION_TIMEOUT_MS,
  type ListOrdersQuery,
  type OrderView,
} from '@pokeshop/shared';
import type {
  Clock,
  OrdersRepository,
  StoredOrderRecord,
} from './orders.repository.js';

export class OrderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 401 | 403 | 404 | 409
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

export function toOrderView(order: StoredOrderRecord): OrderView {
  const expiresAt =
    order.status === 'AGUARDANDO_CONFIRMACAO'
      ? new Date(order.createdAt.getTime() + RESERVATION_TIMEOUT_MS).toISOString()
      : null;

  return {
    id: order.id,
    listingId: order.listingId,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    status: order.status,
    confirmedAt: order.confirmedAt ? order.confirmedAt.toISOString() : null,
    soldAt: order.soldAt ? order.soldAt.toISOString() : null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    expiresAt,
    chatRoomId: order.chatRoom?.id ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    buyer: order.buyer,
    seller: order.seller,
    listing: order.listing,
  };
}

export async function reserveFixedPriceListing(
  listingId: string,
  buyerId: string,
  repository: OrdersRepository,
  clock: Clock = () => new Date()
): Promise<OrderView> {
  const listing = await repository.findListingForReservation(listingId);
  if (!listing) {
    throw new OrderError('Anúncio não encontrado.', 404);
  }
  if (listing.sellerId === buyerId) {
    throw new OrderError('O vendedor não pode reservar o próprio anúncio.', 403);
  }
  if (listing.sellerProfileVisibility === 'PRIVATE') {
    throw new OrderError('Você não tem permissão para reservar este anúncio.', 403);
  }
  if (listing.saleType !== 'PRECO_FIXO') {
    throw new OrderError(
      'Apenas anúncios com modalidade PRECO_FIXO podem ser reservados.',
      400
    );
  }
  if (listing.status !== 'DISPONIVEL') {
    throw new OrderError(
      'Apenas anúncios com status DISPONIVEL podem ser reservados.',
      409
    );
  }

  const created = await repository.reserveListingAtomically({
    listingId,
    buyerId,
    sellerId: listing.sellerId,
    now: clock(),
  });

  if (!created) {
    throw new OrderError(
      'Não foi possível reservar o anúncio porque o estado da negociação foi alterado.',
      409
    );
  }

  return toOrderView(created);
}

export async function confirmFixedPriceReservation(
  orderId: string,
  requesterUserId: string,
  repository: OrdersRepository,
  clock: Clock = () => new Date()
): Promise<OrderView> {
  const existing = await repository.findOrderById(orderId);
  if (!existing) {
    throw new OrderError('Solicitação de compra não encontrada.', 404);
  }

  if (existing.sellerId !== requesterUserId) {
    throw new OrderError(
      'Apenas o vendedor responsável pode confirmar a disponibilidade deste exemplar.',
      403
    );
  }

  if (existing.status !== 'AGUARDANDO_CONFIRMACAO') {
    throw new OrderError(
      'Apenas solicitações com status AGUARDANDO_CONFIRMACAO podem ser confirmadas.',
      409
    );
  }

  const confirmed = await repository.confirmOrderAtomically(orderId, clock());
  if (!confirmed) {
    throw new OrderError(
      'Não foi possível confirmar a reserva porque o estado da negociação foi alterado.',
      409
    );
  }

  return toOrderView(confirmed);
}

export async function declineFixedPriceReservation(
  orderId: string,
  requesterUserId: string,
  repository: OrdersRepository,
  clock: Clock = () => new Date()
): Promise<OrderView> {
  const existing = await repository.findOrderById(orderId);
  if (!existing) {
    throw new OrderError('Solicitação de compra não encontrada.', 404);
  }

  if (existing.buyerId === requesterUserId) {
    throw new OrderError(
      'O comprador não pode cancelar a reserva após iniciar a compra.',
      403
    );
  }

  if (existing.sellerId !== requesterUserId) {
    throw new OrderError(
      'Apenas o vendedor responsável pode recusar esta solicitação de compra.',
      403
    );
  }

  if (existing.status !== 'AGUARDANDO_CONFIRMACAO') {
    throw new OrderError(
      'Apenas solicitações com status AGUARDANDO_CONFIRMACAO podem ser recusadas.',
      409
    );
  }

  const declined = await repository.declineOrderAtomically(orderId, clock());
  if (!declined) {
    throw new OrderError(
      'Não foi possível recusar a reserva porque o estado da negociação foi alterado.',
      409
    );
  }

  return toOrderView(declined);
}

export async function listUserOrders(
  userId: string,
  query: ListOrdersQuery,
  repository: OrdersRepository
): Promise<OrderView[]> {
  const orders = await repository.findOrdersByUser({
    userId,
    role: query.role,
    status: query.status,
  });

  return orders.map(toOrderView);
}

export async function getOrderDetails(
  orderId: string,
  requesterUserId: string,
  repository: OrdersRepository
): Promise<OrderView> {
  const order = await repository.findOrderById(orderId);
  if (!order) {
    throw new OrderError('Solicitação de compra não encontrada.', 404);
  }

  const isParticipant =
    order.buyerId === requesterUserId || order.sellerId === requesterUserId;

  if (!isParticipant) {
    throw new OrderError(
      'Você não tem permissão para acessar os detalhes desta negociação.',
      403
    );
  }

  return toOrderView(order);
}
