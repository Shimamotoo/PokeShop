export const OrderStatus = {
  DISPONIVEL: 'DISPONIVEL',
  AGUARDANDO_CONFIRMACAO: 'AGUARDANDO_CONFIRMACAO',
  NEGOCIACAO_ABERTA: 'NEGOCIACAO_ABERTA',
  VENDIDO: 'VENDIDO',
  CANCELADO: 'CANCELADO',
} as const;

export type OrderStatusType = typeof OrderStatus[keyof typeof OrderStatus];

export const OrderStatusLabels: Record<OrderStatusType, string> = {
  DISPONIVEL: 'Disponível',
  AGUARDANDO_CONFIRMACAO: 'Aguardando confirmação',
  NEGOCIACAO_ABERTA: 'Negociação aberta',
  VENDIDO: 'Vendido',
  CANCELADO: 'Cancelado',
};

export const RESERVATION_TIMEOUT_DAYS = 30;
export const RESERVATION_TIMEOUT_MS = RESERVATION_TIMEOUT_DAYS * 24 * 60 * 60 * 1000;
