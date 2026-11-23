import {
  ALLOWED_PHOTO_MIME_TYPES,
  MAX_LISTING_PHOTOS,
  MAX_PHOTO_SIZE_BYTES,
  MIN_LISTING_PHOTOS,
  RESERVATION_TIMEOUT_MS,
  type AllowedPhotoMimeType,
  type CreateListingInput,
  type ListListingsQuery,
  type ListingActiveOrderView,
  type ListingView,
  type PresignUploadRequest,
} from '@pokeshop/shared';
import type {
  ListingsRepository,
  StoredListingRecord,
} from './listings.repository.js';
import type {
  PresignedDownloadResult,
  PresignedUploadResult,
  S3StorageProvider,
} from './s3-storage.provider.js';

export class ListingError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 401 | 403 | 404 | 409
  ) {
    super(message);
    this.name = 'ListingError';
  }
}

export async function toListingView(
  listing: StoredListingRecord,
  s3Storage: S3StorageProvider,
  requesterUserId: string | null = null
): Promise<ListingView> {
  const photos = await Promise.all(
    listing.photos.map(async (photo) => {
      const signed = await s3Storage.createPresignedDownloadUrl(photo.s3Key);
      return {
        id: photo.id,
        s3Key: photo.s3Key,
        url: signed.downloadUrl,
        orderIndex: photo.orderIndex,
      };
    })
  );

  const canViewActiveOrder =
    Boolean(listing.activeOrder) &&
    requesterUserId !== null &&
    (requesterUserId === listing.sellerId ||
      requesterUserId === listing.activeOrder?.buyerId);

  let activeOrder: ListingActiveOrderView | null = null;
  if (canViewActiveOrder && listing.activeOrder) {
    activeOrder = {
      id: listing.activeOrder.id,
      buyerId: listing.activeOrder.buyerId,
      sellerId: listing.activeOrder.sellerId,
      buyerName: listing.activeOrder.buyer.name,
      status: listing.activeOrder.status,
      createdAt: listing.activeOrder.createdAt.toISOString(),
      confirmedAt: listing.activeOrder.confirmedAt
        ? listing.activeOrder.confirmedAt.toISOString()
        : null,
      expiresAt:
        listing.activeOrder.status === 'AGUARDANDO_CONFIRMACAO'
          ? new Date(
              listing.activeOrder.createdAt.getTime() + RESERVATION_TIMEOUT_MS
            ).toISOString()
          : null,
    };
  }

  return {
    id: listing.id,
    cardId: listing.cardId,
    sellerId: listing.sellerId,
    saleType: listing.saleType,
    priceInCents: listing.priceInCents,
    startingPriceInCents: listing.startingPriceInCents,
    condition: listing.condition,
    language: listing.language,
    edition: listing.edition,
    description: listing.description,
    status: listing.status,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    card: listing.card,
    seller: {
      id: listing.seller.id,
      name: listing.seller.name,
    },
    photos,
    activeOrder,
  };
}

export async function requestPhotoUploadPresign(
  sellerId: string,
  input: PresignUploadRequest,
  s3Storage: S3StorageProvider
): Promise<PresignedUploadResult> {
  if (!ALLOWED_PHOTO_MIME_TYPES.includes(input.contentType as AllowedPhotoMimeType)) {
    throw new ListingError(
      'Formato de imagem inválido. Utilize apenas JPEG, PNG ou WebP.',
      400
    );
  }

  if (input.fileSize <= 0 || input.fileSize > MAX_PHOTO_SIZE_BYTES) {
    throw new ListingError('Cada foto deve ter no máximo 5 MB.', 400);
  }

  return s3Storage.createPresignedUploadUrl({
    sellerId,
    fileName: input.fileName.trim(),
    contentType: input.contentType,
    fileSize: input.fileSize,
  });
}

export async function publishFixedPriceListing(
  sellerId: string,
  input: CreateListingInput,
  repository: ListingsRepository,
  s3Storage: S3StorageProvider
): Promise<ListingView> {
  if (input.saleType !== 'PRECO_FIXO') {
    throw new ListingError(
      'Esta operação aceita apenas anúncios na modalidade PRECO_FIXO.',
      400
    );
  }

  if (
    input.photoKeys.length < MIN_LISTING_PHOTOS ||
    input.photoKeys.length > MAX_LISTING_PHOTOS
  ) {
    throw new ListingError(
      'O anúncio deve conter entre 1 e 5 fotos reais do exemplar.',
      400
    );
  }

  const card = await repository.findCardById(input.cardId);
  if (!card) {
    throw new ListingError('Carta não encontrada no catálogo local.', 404);
  }

  const created = await repository.create({
    cardId: input.cardId,
    sellerId,
    saleType: 'PRECO_FIXO',
    priceInCents: input.priceInCents,
    startingPriceInCents: null,
    condition: input.condition,
    language: input.language.trim() || 'PT-BR',
    edition: input.edition?.trim() ? input.edition.trim() : null,
    description: input.description?.trim() ? input.description.trim() : null,
    photoKeys: input.photoKeys.map((key) => key.trim()),
  });

  return toListingView(created, s3Storage);
}

export async function listListings(
  query: ListListingsQuery,
  repository: ListingsRepository,
  s3Storage: S3StorageProvider
): Promise<ListingView[]> {
  const records = await repository.findMany({
    cardId: query.cardId,
    tcgdexId: query.tcgdexId,
    sellerId: query.sellerId,
    status: query.status ?? 'DISPONIVEL',
  });

  const visibleRecords = records.filter(
    (record) => record.seller.profileVisibility === 'PUBLIC'
  );

  return Promise.all(visibleRecords.map((record) => toListingView(record, s3Storage)));
}

export async function getListingDetails(
  listingId: string,
  requesterUserId: string | null,
  repository: ListingsRepository,
  s3Storage: S3StorageProvider
): Promise<ListingView> {
  const listing = await repository.findById(listingId);
  if (!listing) {
    throw new ListingError('Anúncio não encontrado.', 404);
  }

  const isOwner = requesterUserId !== null && listing.sellerId === requesterUserId;
  const isParticipant =
    isOwner ||
    (requesterUserId !== null && listing.activeOrder?.buyerId === requesterUserId);
  const isPrivateOrCancelled =
    listing.seller.profileVisibility === 'PRIVATE' || listing.status === 'CANCELADO';

  if (isPrivateOrCancelled && !isParticipant) {
    throw new ListingError('Você não tem permissão para visualizar este anúncio.', 403);
  }

  return toListingView(listing, s3Storage, requesterUserId);
}

export async function authorizeAndSignMediaRead(
  s3Key: string,
  requesterUserId: string | null,
  repository: ListingsRepository,
  s3Storage: S3StorageProvider
): Promise<PresignedDownloadResult> {
  // Policy Gate (ADR-003): valida existência e visibilidade antes de assinar URL de leitura no S3
  const context = await repository.findMediaAccessContext(s3Key);
  if (!context) {
    throw new ListingError('Mídia não encontrada.', 404);
  }
  if (context.visibility === 'PRIVATE' && context.ownerId !== requesterUserId) {
    throw new ListingError('Você não tem permissão para acessar esta mídia privada.', 403);
  }
  return s3Storage.createPresignedDownloadUrl(context.s3Key);
}

export async function cancelFixedPriceListing(
  listingId: string,
  requesterUserId: string,
  repository: ListingsRepository,
  s3Storage: S3StorageProvider
): Promise<ListingView> {
  // Máquina de estados (FR-023): apenas o vendedor dono pode cancelar anúncio DISPONIVEL -> CANCELADO
  const listing = await repository.findById(listingId);
  if (!listing) {
    throw new ListingError('Anúncio não encontrado.', 404);
  }
  if (listing.sellerId !== requesterUserId) {
    throw new ListingError('Apenas o vendedor responsável pode cancelar este anúncio.', 403);
  }
  if (listing.status !== 'DISPONIVEL') {
    throw new ListingError('Apenas anúncios com status DISPONIVEL podem ser cancelados.', 409);
  }
  const cancelled = await repository.cancelListing(listingId);
  return toListingView(cancelled, s3Storage);
}
