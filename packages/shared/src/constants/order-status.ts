export const OrderStatus = {
  DISPONIVEL: 'DISPONIVEL',
  AGUARDANDO_CONFIRMACAO: 'AGUARDANDO_CONFIRMACAO',
  NEGOCIACAO_ABERTA: 'NEGOCIACAO_ABERTA',
  VENDIDO: 'VENDIDO',
  CANCELADO: 'CANCELADO',
} as const;

export type OrderStatusType = typeof OrderStatus[keyof typeof OrderStatus];
