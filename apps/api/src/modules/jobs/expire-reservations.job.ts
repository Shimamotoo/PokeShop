import { RESERVATION_TIMEOUT_MS } from '@pokeshop/shared';
import type { Clock, OrdersRepository } from '../orders/orders.repository.js';

export type ExpireReservationsRepository = Pick<
  OrdersRepository,
  'findExpiredPendingOrderIds' | 'expireOrderAtomically'
>;

export type ExpireReservationsResult = {
  checkedAt: string;
  cutoffAt: string;
  expiredCount: number;
  expiredOrderIds: string[];
};

export async function expirePendingFixedPriceReservations(
  repository: ExpireReservationsRepository,
  clock: Clock = () => new Date()
): Promise<ExpireReservationsResult> {

  const now = clock();
  const cutoffDate = new Date(now.getTime() - RESERVATION_TIMEOUT_MS);


  const candidateOrderIds = await repository.findExpiredPendingOrderIds(cutoffDate);
  const expiredOrderIds: string[] = [];

  for (const orderId of candidateOrderIds) {
    const expired = await repository.expireOrderAtomically(orderId, now);
    if (expired) {
      expiredOrderIds.push(orderId);
    }
  }

  return {
    checkedAt: now.toISOString(),
    cutoffAt: cutoffDate.toISOString(),
    expiredCount: expiredOrderIds.length,
    expiredOrderIds,
  };
}