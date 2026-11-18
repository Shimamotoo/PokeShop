import { z } from 'zod';
import { CardCondition } from '../constants/conditions.js';

export const listingSaleTypeSchema = z.enum(['PRECO_FIXO', 'PROPOSTAS']);
export type ListingSaleType = z.infer<typeof listingSaleTypeSchema>;

export const createListingSchema = z.object({
  cardId: z.string().uuid('ID de carta inválido'),
  saleType: listingSaleTypeSchema,
  priceInCents: z.number().int().positive('O valor deve ser positivo').max(100_000_000, 'Valor máximo excedido'),
  condition: z.enum([
    CardCondition.PERFEITO_ESTADO,
    CardCondition.POUCO_USADA,
    CardCondition.MARCAS_DE_USO,
    CardCondition.DANIFICADA,
  ]),
  language: z.string().default('PT-BR'),
  edition: z.string().optional(),
  description: z.string().max(2000, 'Descrição não pode exceder 2000 caracteres').optional(),
  photoUrls: z.array(z.string().url('URL inválida'))
    .min(1, 'Pelo menos uma foto real é obrigatória')
    .max(5, 'Máximo de 5 fotos permitidas'),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;
