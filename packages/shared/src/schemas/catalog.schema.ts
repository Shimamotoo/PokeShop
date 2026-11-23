import { z } from 'zod';

export const catalogCardSchema = z.object({
  id: z.string().uuid(),
  tcgdexId: z.string(),
  name: z.string(),
  setName: z.string(),
  cardNumber: z.string(),
  rarity: z.string(),
  imageUrl: z.string().url().nullable(),
});

export const catalogSearchQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

export const catalogSearchResponseSchema = z.object({
  items: z.array(catalogCardSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type CatalogCard = z.infer<typeof catalogCardSchema>;
export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;
export type CatalogSearchResponse = z.infer<typeof catalogSearchResponseSchema>;
