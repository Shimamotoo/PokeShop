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
  // 1. Captura o instante atual UMA única vez para now e cutoffDate não divergirem
  const now = clock();
  const cutoffDate = new Date(now.getTime() - RESERVATION_TIMEOUT_MS);

  // 2. Busca todos os pedidos em AGUARDANDO_CONFIRMACAO criados há >= 30 dias
  const candidateOrderIds = await repository.findExpiredPendingOrderIds(cutoffDate);
  const expiredOrderIds: string[] = [];

  // 3. Tenta expirar cada pedido atomicamente; se o vendedor confirmou antes,
  //    expireOrderAtomically retorna false e o ID não entra na lista
  for (const orderId of candidateOrderIds) {
    const expired = await repository.expireOrderAtomically(orderId, now);
    if (expired) {
      expiredOrderIds.push(orderId);
    }
  }

  // 4. Devolve o resumo determinístico da execução
  return {
    checkedAt: now.toISOString(),
    cutoffAt: cutoffDate.toISOString(),
    expiredCount: expiredOrderIds.length,
    expiredOrderIds,
  };
}