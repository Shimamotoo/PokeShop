import { z } from 'zod';
import { orderParticipantSchema } from './order.schema.js';

export const proposalStatusSchema = z.enum(['PENDENTE', 'ACEITA', 'RECUSADA']);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const createProposalSchema = z.object({
  amountInCents: z
    .number()
    .int('A proposta deve ser informada em centavos inteiros.')
    .positive('A proposta deve ser maior que zero.')
    .max(100_000_000, 'Valor máximo excedido.'),
});
export type CreateProposalInput = z.infer<typeof createProposalSchema>;

export const proposalResponseSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  buyerId: z.string().uuid(),
  amountInCents: z.number().int(),
  status: proposalStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  buyer: orderParticipantSchema,
});
export type ProposalView = z.infer<typeof proposalResponseSchema>;

export const listProposalsResponseSchema = z.object({
  items: z.array(proposalResponseSchema),
});
export type ListProposalsResponse = z.infer<typeof listProposalsResponseSchema>;
