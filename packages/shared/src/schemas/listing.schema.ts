import { z } from 'zod';
import { CardCondition } from '../constants/conditions.js';
import { OrderStatus } from '../constants/order-status.js';

export const ALLOWED_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedPhotoMimeType = (typeof ALLOWED_PHOTO_MIME_TYPES)[number];

export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MIN_LISTING_PHOTOS = 1;
export const MAX_LISTING_PHOTOS = 5;

export const listingSaleTypeSchema = z.enum(['PRECO_FIXO', 'PROPOSTAS']);
export type ListingSaleType = z.infer<typeof listingSaleTypeSchema>;

export const cardConditionSchema = z.enum([
  CardCondition.PERFEITO_ESTADO,
  CardCondition.POUCO_USADA,
  CardCondition.MARCAS_DE_USO,
  CardCondition.DANIFICADA,
]);

export const listingStatusSchema = z.enum([
  OrderStatus.DISPONIVEL,
  OrderStatus.AGUARDANDO_CONFIRMACAO,
  OrderStatus.NEGOCIACAO_ABERTA,
  OrderStatus.VENDIDO,
  OrderStatus.CANCELADO,
]);

export const presignUploadRequestSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, 'O nome do arquivo é obrigatório.')
    .max(255, 'Nome do arquivo muito longo.'),
  contentType: z.enum(ALLOWED_PHOTO_MIME_TYPES, {
    errorMap: () => ({
      message: 'Formato de imagem inválido. Utilize apenas JPEG, PNG ou WebP.',
    }),
  }),
  fileSize: z
    .number()
    .int()
    .positive('O tamanho do arquivo deve ser maior que zero.')
    .max(MAX_PHOTO_SIZE_BYTES, 'Cada foto deve ter no máximo 5 MB.'),
});

export type PresignUploadRequest = z.infer<typeof presignUploadRequestSchema>;

export const presignUploadResponseSchema = z.object({
  s3Key: z.string(),
  uploadUrl: z.string().url(),
  expiresIn: z.number().int(),
});

export type PresignUploadResponse = z.infer<typeof presignUploadResponseSchema>;

export const presignDownloadResponseSchema = z.object({
  s3Key: z.string(),
  downloadUrl: z.string().url(),
  expiresIn: z.number().int(),
});

export type PresignDownloadResponse = z.infer<typeof presignDownloadResponseSchema>;

export const createListingSchema = z.object({
  cardId: z.string().uuid('ID de carta inválido.'),
  saleType: listingSaleTypeSchema.default('PRECO_FIXO'),
  priceInCents: z
    .number()
    .int('O preço deve ser informado em centavos inteiros.')
    .positive('O preço deve ser maior que zero.')
    .max(100_000_000, 'Valor máximo excedido.'),
  condition: cardConditionSchema,
  language: z
    .string()
    .trim()
    .min(2, 'O idioma é obrigatório.')
    .max(40, 'Idioma inválido.')
    .default('PT-BR'),
  edition: z
    .string()
    .trim()
    .max(120, 'A edição não pode exceder 120 caracteres.')
    .optional()
    .nullable(),
  description: z
    .string()
    .trim()
    .max(2000, 'As observações não podem exceder 2000 caracteres.')
    .optional()
    .nullable(),
  photoKeys: z
    .array(z.string().trim().min(1, 'Chave S3 da foto é obrigatória.'))
    .min(MIN_LISTING_PHOTOS, 'Pelo menos 1 foto real do exemplar é obrigatória.')
    .max(MAX_LISTING_PHOTOS, 'Máximo de 5 fotos permitidas por anúncio.'),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;

export const listingPhotoSchema = z.object({
  id: z.string().uuid(),
  s3Key: z.string(),
  url: z.string().url(),
  orderIndex: z.number().int(),
});

export type ListingPhotoView = z.infer<typeof listingPhotoSchema>;

export const listingSellerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export const listingCardSummarySchema = z.object({
  id: z.string().uuid(),
  tcgdexId: z.string(),
  name: z.string(),
  setName: z.string(),
  cardNumber: z.string(),
  rarity: z.string(),
  imageUrl: z.string().url().nullable(),
});

export const listingResponseSchema = z.object({
  id: z.string().uuid(),
  cardId: z.string().uuid(),
  sellerId: z.string().uuid(),
  saleType: listingSaleTypeSchema,
  priceInCents: z.number().int(),
  startingPriceInCents: z.number().int().nullable(),
  condition: cardConditionSchema,
  language: z.string(),
  edition: z.string().nullable(),
  description: z.string().nullable(),
  status: listingStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  card: listingCardSummarySchema,
  seller: listingSellerSchema,
  photos: z.array(listingPhotoSchema),
});

export type ListingView = z.infer<typeof listingResponseSchema>;

export const listListingsQuerySchema = z.object({
  cardId: z.string().uuid().optional(),
  tcgdexId: z.string().trim().min(1).optional(),
  sellerId: z.string().uuid().optional(),
  status: listingStatusSchema.optional(),
});

export type ListListingsQuery = z.infer<typeof listListingsQuerySchema>;

export const listListingsResponseSchema = z.object({
  items: z.array(listingResponseSchema),
});

export type ListListingsResponse = z.infer<typeof listListingsResponseSchema>;
