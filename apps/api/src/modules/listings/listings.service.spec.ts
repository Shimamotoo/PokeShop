import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type {
  ListingsRepository,
  MediaAccessContext,
  StoredCardSummary,
  StoredListingRecord,
} from './listings.repository.js';
import type { S3StorageProvider } from './s3-storage.provider.js';
import {
  authorizeAndSignMediaRead,
  cancelFixedPriceListing,
  ListingError,
  publishFixedPriceListing,
  requestPhotoUploadPresign,
} from './listings.service.js';

function createFakeS3(): S3StorageProvider & { signedDownloads: string[] } {
  const signedDownloads: string[] = [];

  return {
    signedDownloads,
    async createPresignedUploadUrl(input) {
      const s3Key = `listings/${input.sellerId}/test-${input.fileName}`;
      return {
        s3Key,
        uploadUrl: `https://fake-s3.local/upload/${encodeURIComponent(s3Key)}?sig=put`,
        expiresIn: 900,
      };
    },
    async createPresignedDownloadUrl(s3Key) {
      signedDownloads.push(s3Key);
      return {
        s3Key,
        downloadUrl: `https://fake-s3.local/download/${encodeURIComponent(s3Key)}?sig=get`,
        expiresIn: 900,
      };
    },
  };
}

function createFakeRepository(seed?: {
  cards?: StoredCardSummary[];
  listings?: StoredListingRecord[];
  mediaContexts?: Record<string, MediaAccessContext>;
}): ListingsRepository {
  const cards = [...(seed?.cards ?? [])];
  const listings = [...(seed?.listings ?? [])];
  const mediaContexts: Record<string, MediaAccessContext> = {
    ...(seed?.mediaContexts ?? {}),
  };

  return {
    async findCardById(cardId) {
      return cards.find((c) => c.id === cardId) ?? null;
    },
    async create(data) {
      const card = cards.find((c) => c.id === data.cardId);
      if (!card) throw new Error('Card not found');
      const now = new Date();
      const record: StoredListingRecord = {
        id: randomUUID(),
        cardId: data.cardId,
        sellerId: data.sellerId,
        saleType: data.saleType,
        priceInCents: data.priceInCents,
        startingPriceInCents: data.startingPriceInCents ?? null,
        condition: data.condition,
        language: data.language,
        edition: data.edition,
        description: data.description,
        status: 'DISPONIVEL',
        createdAt: now,
        updatedAt: now,
        card,
        seller: {
          id: data.sellerId,
          name: 'Vendedor Teste',
          profileVisibility: 'PUBLIC',
        },
        photos: data.photoKeys.map((s3Key, index) => ({
          id: randomUUID(),
          s3Key,
          orderIndex: index,
        })),
      };
      listings.push(record);
      return record;
    },
    async findById(listingId) {
      return listings.find((l) => l.id === listingId) ?? null;
    },
    async findMany(filter) {
      return listings.filter((l) => {
        if (filter.cardId && l.cardId !== filter.cardId) return false;
        if (filter.tcgdexId && l.card.tcgdexId !== filter.tcgdexId) return false;
        if (filter.sellerId && l.sellerId !== filter.sellerId) return false;
        if (filter.status && l.status !== filter.status) return false;
        return true;
      });
    },
    async cancelListing(listingId) {
      const listing = listings.find((l) => l.id === listingId);
      if (!listing) throw new Error('Listing not found');
      listing.status = 'CANCELADO';
      listing.updatedAt = new Date();
      return listing;
    },
    async findMediaAccessContext(s3Key) {
      return mediaContexts[s3Key] ?? null;
    },
  };
}

describe('Serviço de anúncios (listings.service)', () => {
  const sampleCardId = randomUUID();
  const sampleCard: StoredCardSummary = {
    id: sampleCardId,
    tcgdexId: 'sv01-25',
    name: 'Pikachu',
    setName: 'Escarlate e Violeta',
    cardNumber: '25',
    rarity: 'Common',
    imageUrl: 'https://assets.tcgdex.net/pt/sv/sv01/25',
  };

  it('requestPhotoUploadPresign emite URL pré-assinada para JPEG, PNG e WebP até 5 MB e rejeita excesso', async () => {
    const s3 = createFakeS3();
    const sellerId = randomUUID();

    const presigned = await requestPhotoUploadPresign(
      sellerId,
      {
        fileName: 'frente-pikachu.webp',
        contentType: 'image/webp',
        fileSize: 2 * 1024 * 1024,
      },
      s3
    );

    assert.ok(presigned.s3Key.includes(sellerId));
    assert.ok(presigned.uploadUrl.startsWith('https://fake-s3.local/upload/'));

    await assert.rejects(
      () =>
        requestPhotoUploadPresign(
          sellerId,
          {
            fileName: 'foto-grande.jpg',
            contentType: 'image/jpeg',
            fileSize: 5 * 1024 * 1024 + 1,
          },
          s3
        ),
      (err: unknown) => err instanceof ListingError && err.statusCode === 400
    );
  });

  it('publishFixedPriceListing cria anúncio DISPONIVEL vinculado a uma Carta de catálogo com fotos assinadas', async () => {
    const s3 = createFakeS3();
    const repo = createFakeRepository({ cards: [sampleCard] });
    const sellerId = randomUUID();

    const listing = await publishFixedPriceListing(
      sellerId,
      {
        cardId: sampleCardId,
        saleType: 'PRECO_FIXO',
        priceInCents: 14990,
        condition: 'PERFEITO_ESTADO',
        language: 'PT-BR',
        edition: '1ª Edição Reverse Foil',
        description: 'Carta tirada do booster direto para o sleeve.',
        photoKeys: ['listings/seller/frente.jpg', 'listings/seller/verso.png'],
      },
      repo,
      s3
    );

    assert.equal(listing.status, 'DISPONIVEL');
    assert.equal(listing.priceInCents, 14990);
    assert.equal(listing.condition, 'PERFEITO_ESTADO');
    assert.equal(listing.photos.length, 2);
    assert.ok(listing.photos[0].url.includes('sig=get'));
  });

  it('authorizeAndSignMediaRead permite leitura pública, permite dono em mídia privada e nega visitante/terceiro em mídia privada', async () => {
    const s3 = createFakeS3();
    const ownerId = randomUUID();
    const strangerId = randomUUID();

    const repo = createFakeRepository({
      mediaContexts: {
        'listings/public/card-1.jpg': {
          s3Key: 'listings/public/card-1.jpg',
          ownerId,
          visibility: 'PUBLIC',
        },
        'collections/private/secret-card.webp': {
          s3Key: 'collections/private/secret-card.webp',
          ownerId,
          visibility: 'PRIVATE',
        },
      },
    });

    // 1. Visitante sem login acessa mídia pública -> Permitido
    const publicRead = await authorizeAndSignMediaRead(
      'listings/public/card-1.jpg',
      null,
      repo,
      s3
    );
    assert.equal(publicRead.s3Key, 'listings/public/card-1.jpg');
    assert.ok(publicRead.downloadUrl.includes('sig=get'));

    // 2. Visitante sem login tenta acessar mídia privada -> Negado (403) sem chamar S3
    const downloadsBeforeDenied = s3.signedDownloads.length;
    await assert.rejects(
      () =>
        authorizeAndSignMediaRead(
          'collections/private/secret-card.webp',
          null,
          repo,
          s3
        ),
      (err: unknown) => err instanceof ListingError && err.statusCode === 403
    );

    // 3. Outro usuário autenticado tenta acessar mídia privada -> Negado (403)
    await assert.rejects(
      () =>
        authorizeAndSignMediaRead(
          'collections/private/secret-card.webp',
          strangerId,
          repo,
          s3
        ),
      (err: unknown) => err instanceof ListingError && err.statusCode === 403
    );
    assert.equal(s3.signedDownloads.length, downloadsBeforeDenied);

    // 4. O próprio dono acessa sua mídia privada -> Permitido
    const ownerRead = await authorizeAndSignMediaRead(
      'collections/private/secret-card.webp',
      ownerId,
      repo,
      s3
    );
    assert.equal(ownerRead.s3Key, 'collections/private/secret-card.webp');
    assert.equal(s3.signedDownloads.length, downloadsBeforeDenied + 1);

    // 5. Chave inexistente -> 404
    await assert.rejects(
      () => authorizeAndSignMediaRead('nao-existe.jpg', null, repo, s3),
      (err: unknown) => err instanceof ListingError && err.statusCode === 404
    );
  });

  it('cancelFixedPriceListing cancela anúncio DISPONIVEL do vendedor e bloqueia não-dono ou estado inválido', async () => {
    const s3 = createFakeS3();
    const sellerId = randomUUID();
    const otherUserId = randomUUID();
    const repo = createFakeRepository({ cards: [sampleCard] });

    const created = await publishFixedPriceListing(
      sellerId,
      {
        cardId: sampleCardId,
        saleType: 'PRECO_FIXO',
        priceInCents: 8900,
        condition: 'POUCO_USADA',
        language: 'PT-BR',
        edition: null,
        description: null,
        photoKeys: ['listings/seller/foto-1.jpg'],
      },
      repo,
      s3
    );

    // Tentativa por outro usuário -> 403
    await assert.rejects(
      () => cancelFixedPriceListing(created.id, otherUserId, repo, s3),
      (err: unknown) => err instanceof ListingError && err.statusCode === 403
    );

    // Cancelamento pelo vendedor dono enquanto DISPONIVEL -> 200 CANCELADO
    const cancelled = await cancelFixedPriceListing(created.id, sellerId, repo, s3);
    assert.equal(cancelled.status, 'CANCELADO');

    // Tentativa de cancelar novamente quando já está CANCELADO -> 409
    await assert.rejects(
      () => cancelFixedPriceListing(created.id, sellerId, repo, s3),
      (err: unknown) => err instanceof ListingError && err.statusCode === 409
    );
  });
});
