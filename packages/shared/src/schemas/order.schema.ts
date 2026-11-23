import { z } from 'zod';
import {
  cardConditionSchema,
  listingCardSummarySchema,
  listingSaleTypeSchema,
  listingStatusSchema,
} from './listing.schema.js';

export const createOrderSchema = z.object({
  listingId: z.string().uuid('ID do anúncio inválido.'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderParticipantSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export type OrderParticipantView = z.infer<typeof orderParticipantSchema>;

export const orderListingSummarySchema = z.object({
  id: z.string().uuid(),
  saleType: listingSaleTypeSchema,
  priceInCents: z.number().int(),
  condition: cardConditionSchema,
  language: z.string(),
  edition: z.string().nullable(),
  status: listingStatusSchema,
  card: listingCardSummarySchema,
});

export type OrderListingSummaryView = z.infer<typeof orderListingSummarySchema>;

export const orderResponseSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  buyerId: z.string().uuid(),
  sellerId: z.string().uuid(),
  status: listingStatusSchema,
  confirmedAt: z.string().nullable(),
  soldAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  chatRoomId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  buyer: orderParticipantSchema,
  seller: orderParticipantSchema,
  listing: orderListingSummarySchema,
});

export type OrderView = z.infer<typeof orderResponseSchema>;

export const listOrdersQuerySchema = z.object({
  role: z.enum(['all', 'buyer', 'seller']).default('all'),
  status: listingStatusSchema.optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

export const listOrdersResponseSchema = z.object({
  items: z.array(orderResponseSchema),
});

export type ListOrdersResponse = z.infer<typeof listOrdersResponseSchema>;
