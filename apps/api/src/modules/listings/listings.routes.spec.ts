import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type {
  AuthUserRepository,
  CreateUserRecordInput,
  StoredUserRecord,
} from '../auth/auth.service.js';
import type {
  ListingsRepository,
  MediaAccessContext,
  StoredCardSummary,
  StoredListingRecord,
} from './listings.repository.js';
import type { S3StorageProvider } from './s3-storage.provider.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/pokeshop_test?schema=public';

process.env.DATABASE_URL = TEST_DATABASE_URL;

function formatBirthDateForAge(yearsOld: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - yearsOld);
  return date.toISOString().slice(0, 10);
}

describe('Rotas HTTP de anúncios (/listings)', () => {
  let app: FastifyInstance;
  let signedUploads: string[];
  let signedDownloads: string[];
  let cardId: string;
  let usePostgresTestDb = false;

  // Estado do banco de teste em memória (fallback caso o container postgres-test na porta 5433 esteja inacessível)
  const testUsers: StoredUserRecord[] = [];
  const testCards: StoredCardSummary[] = [];
  const testListings: StoredListingRecord[] = [];
  const testProposals: Array<{
    id: string;
    listingId: string;
    buyerId: string;
    amountInCents: number;
    status: 'PENDENTE' | 'ACEITA' | 'RECUSADA';
  }> = [];
  const testMediaContexts: Record<string, MediaAccessContext> = {};

  const fakeS3Storage: S3StorageProvider = {
    async createPresignedUploadUrl(input) {
      const s3Key = `listings/${input.sellerId}/${randomUUID()}-${input.fileName}`;
      signedUploads.push(s3Key);
      return {
        s3Key,
        uploadUrl: `https://s3-fake.pokeshop.test/upload/${encodeURIComponent(s3Key)}?expires=900`,
        expiresIn: 900,
      };
    },
    async createPresignedDownloadUrl(s3Key) {
      signedDownloads.push(s3Key);
      return {
        s3Key,
        downloadUrl: `https://s3-fake.pokeshop.test/download/${encodeURIComponent(s3Key)}?expires=900`,
        expiresIn: 900,
      };
    },
  };

  const fallbackAuthRepo: AuthUserRepository = {
    async findByEmail(email) {
      return testUsers.find((u) => u.email === email) ?? null;
    },
    async findById(id) {
      return testUsers.find((u) => u.id === id) ?? null;
    },
    async findByGoogleId(googleId) {
      return testUsers.find((u) => u.googleId === googleId) ?? null;
    },
    async create(data: CreateUserRecordInput) {
      const created: StoredUserRecord = {
        id: randomUUID(),
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash ?? null,
        birthDate: data.birthDate,
        termsAcceptedAt: data.termsAcceptedAt,
        googleId: data.googleId ?? null,
        role: 'USER',
        isBanned: false,
      };
      testUsers.push(created);
      return created;
    },
    async linkGoogleId(userId, googleId) {
      const user = testUsers.find((u) => u.id === userId);
      if (!user) throw new Error('User not found');
      user.googleId = googleId;
      return user;
    },
  };

  const fallbackListingsRepo: ListingsRepository = {
    async findCardById(id) {
      return testCards.find((c) => c.id === id) ?? null;
    },
    async create(data) {
      const card = testCards.find((c) => c.id === data.cardId);
      const seller = testUsers.find((u) => u.id === data.sellerId);
      if (!card || !seller) throw new Error('Card or seller not found');
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
          id: seller.id,
          name: seller.name,
          profileVisibility: 'PUBLIC',
        },
        photos: data.photoKeys.map((s3Key, index) => {
          testMediaContexts[s3Key] = {
            s3Key,
            ownerId: seller.id,
            visibility: 'PUBLIC',
          };
          return {
            id: randomUUID(),
            s3Key,
            orderIndex: index,
          };
        }),
      };
      testListings.push(record);
      return record;
    },
    async findById(id) {
      return testListings.find((l) => l.id === id) ?? null;
    },
    async findMany(filter) {
      return testListings.filter((l) => {
        if (filter.cardId && l.cardId !== filter.cardId) return false;
        if (filter.tcgdexId && l.card.tcgdexId !== filter.tcgdexId) return false;
        if (filter.sellerId && l.sellerId !== filter.sellerId) return false;
        if (filter.saleType && l.saleType !== filter.saleType) return false;
        if (filter.status && l.status !== filter.status) return false;
        return true;
      });
    },
    async cancelListing(id) {
      const listing = testListings.find((l) => l.id === id);
      if (!listing || listing.status !== 'DISPONIVEL') return null;
      listing.status = 'CANCELADO';
      listing.updatedAt = new Date();
      for (const proposal of testProposals) {
        if (proposal.listingId === id && proposal.status === 'PENDENTE') {
          proposal.status = 'RECUSADA';
        }
      }
      for (const photo of listing.photos) {
        testMediaContexts[photo.s3Key] = {
          s3Key: photo.s3Key,
          ownerId: listing.sellerId,
          visibility: 'PRIVATE',
        };
      }
      return listing;
    },
    async findMediaAccessContext(s3Key) {
      return testMediaContexts[s3Key] ?? null;
    },
  };

  before(async () => {
    signedUploads = [];
    signedDownloads = [];

    const [{ buildApp }, { prisma }] = await Promise.all([
      import('../../app.js'),
      import('@pokeshop/database'),
    ]);

    try {
      await prisma.$queryRaw`SELECT 1`;
      usePostgresTestDb = true;
    } catch {
      usePostgresTestDb = false;
    }

    app = buildApp({
      logger: false,
      ...(usePostgresTestDb
        ? {
            listings: {
              s3Storage: fakeS3Storage,
            },
          }
        : {
            auth: {
              authRepository: fallbackAuthRepo,
            },
            listings: {
              listingsRepository: fallbackListingsRepo,
              s3Storage: fakeS3Storage,
            },
          }),
    });
    await app.ready();
  });

  beforeEach(async () => {
    signedUploads.length = 0;
    signedDownloads.length = 0;

    if (usePostgresTestDb) {
      const { prisma } = await import('@pokeshop/database');
      await prisma.chatMessage.deleteMany();
      await prisma.chatRoom.deleteMany();
      await prisma.postPhoto.deleteMany();
      await prisma.post.deleteMany();
      await prisma.listingPhoto.deleteMany();
      await prisma.proposal.deleteMany();
      await prisma.order.deleteMany();
      await prisma.listing.deleteMany();
      await prisma.collectionItem.deleteMany();
      await prisma.collection.deleteMany();
      await prisma.card.deleteMany();
      await prisma.user.deleteMany();

      const card = await prisma.card.create({
        data: {
          tcgdexId: 'sv02-10',
          name: 'Charizard ex',
          setName: 'Evoluções em Paldea',
          cardNumber: '10',
          rarity: 'Double Rare',
          imageUrl: 'https://assets.tcgdex.net/pt/sv/sv02/10',
        },
      });

      cardId = card.id;
    } else {
      testUsers.length = 0;
      testCards.length = 0;
      testListings.length = 0;
      testProposals.length = 0;
      for (const key of Object.keys(testMediaContexts)) {
        delete testMediaContexts[key];
      }

      cardId = randomUUID();
      testCards.push({
        id: cardId,
        tcgdexId: 'sv02-10',
        name: 'Charizard ex',
        setName: 'Evoluções em Paldea',
        cardNumber: '10',
        rarity: 'Double Rare',
        imageUrl: 'https://assets.tcgdex.net/pt/sv/sv02/10',
      });
    }
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  async function registerAndLogin(name: string, email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name,
        email,
        password: 'password-123',
        birthDate: formatBirthDateForAge(22),
        termsAccepted: true,
      },
    });

    assert.equal(res.statusCode, 201);
    return res.json() as { token: string; user: { id: string; email: string; name: string } };
  }

  async function seedPrivateMedia(ownerId: string, s3Key: string) {
    if (usePostgresTestDb) {
      const { prisma } = await import('@pokeshop/database');
      await prisma.post.create({
        data: {
          authorId: ownerId,
          content: 'Minha coleção privada',
          visibility: 'PRIVATE',
          photos: {
            create: [{ s3Key, orderIndex: 0 }],
          },
        },
      });
    } else {
      testMediaContexts[s3Key] = {
        s3Key,
        ownerId,
        visibility: 'PRIVATE',
      };
    }
  }

  async function seedPendingProposals(
    listingId: string,
    buyers: Array<{ buyerId: string; amountInCents: number }>
  ) {
    if (usePostgresTestDb) {
      const { prisma } = await import('@pokeshop/database');
      await prisma.proposal.createMany({
        data: buyers.map((entry) => ({
          listingId,
          buyerId: entry.buyerId,
          amountInCents: entry.amountInCents,
          status: 'PENDENTE',
        })),
      });
    } else {
      for (const entry of buyers) {
        testProposals.push({
          id: randomUUID(),
          listingId,
          buyerId: entry.buyerId,
          amountInCents: entry.amountInCents,
          status: 'PENDENTE',
        });
      }
    }
  }

  async function getProposalStatuses(listingId: string): Promise<string[]> {
    if (usePostgresTestDb) {
      const { prisma } = await import('@pokeshop/database');
      const rows = await prisma.proposal.findMany({
        where: { listingId },
        select: { status: true },
      });
      return rows.map((row) => row.status);
    }

    return testProposals
      .filter((proposal) => proposal.listingId === listingId)
      .map((proposal) => proposal.status);
  }

  it('Valida formato (JPEG, PNG, WebP) e tamanho máximo de 5 MB ao emitir Presigned PUT URL', async () => {
    const seller = await registerAndLogin('Ash Ketchum', 'ash@pokeshop.br');

    // Formatos permitidos: JPEG, PNG e WebP até 5 MB
    for (const [fileName, contentType] of [
      ['frente.jpg', 'image/jpeg'],
      ['verso.png', 'image/png'],
      ['detalhe.webp', 'image/webp'],
    ] as const) {
      const okRes = await app.inject({
        method: 'POST',
        url: '/listings/media/presign-upload',
        headers: { authorization: `Bearer ${seller.token}` },
        payload: {
          fileName,
          contentType,
          fileSize: 5 * 1024 * 1024,
        },
      });

      assert.equal(okRes.statusCode, 201);
      const body = okRes.json();
      assert.ok(body.s3Key.startsWith(`listings/${seller.user.id}/`));
      assert.ok(body.uploadUrl.includes('https://s3-fake.pokeshop.test/upload/'));
    }

    // Formato não permitido (ex: GIF / PDF) -> 400
    const badMimeRes = await app.inject({
      method: 'POST',
      url: '/listings/media/presign-upload',
      headers: { authorization: `Bearer ${seller.token}` },
      payload: {
        fileName: 'animado.gif',
        contentType: 'image/gif',
        fileSize: 1024,
      },
    });
    assert.equal(badMimeRes.statusCode, 400);

    // Arquivo acima de 5 MB -> 400
    const tooLargeRes = await app.inject({
      method: 'POST',
      url: '/listings/media/presign-upload',
      headers: { authorization: `Bearer ${seller.token}` },
      payload: {
        fileName: 'pesada.png',
        contentType: 'image/png',
        fileSize: 5 * 1024 * 1024 + 1,
      },
    });
    assert.equal(tooLargeRes.statusCode, 400);
  });

  it('Publica anúncio de preço fixo com 1 a 5 fotos e permite consulta pública por visitantes sem login', async () => {
    const seller = await registerAndLogin('Misty Waterflower', 'misty@pokeshop.br');

    // Solicita presign para 2 fotos reais do exemplar
    const presign1 = await app.inject({
      method: 'POST',
      url: '/listings/media/presign-upload',
      headers: { authorization: `Bearer ${seller.token}` },
      payload: {
        fileName: 'charizard-frente.jpg',
        contentType: 'image/jpeg',
        fileSize: 420_000,
      },
    });
    const presign2 = await app.inject({
      method: 'POST',
      url: '/listings/media/presign-upload',
      headers: { authorization: `Bearer ${seller.token}` },
      payload: {
        fileName: 'charizard-verso.webp',
        contentType: 'image/webp',
        fileSize: 380_000,
      },
    });

    const key1 = presign1.json().s3Key as string;
    const key2 = presign2.json().s3Key as string;

    // Publica o anúncio de preço fixo
    const createRes = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { authorization: `Bearer ${seller.token}` },
      payload: {
        cardId,
        saleType: 'PRECO_FIXO',
        priceInCents: 24990,
        condition: 'PERFEITO_ESTADO',
        language: 'PT-BR',
        edition: 'Foil Nacional',
        description: 'Exemplar sem whitening, centralização excelente.',
        photoKeys: [key1, key2],
      },
    });

    assert.equal(createRes.statusCode, 201);
    const created = createRes.json();
    assert.equal(created.cardId, cardId);
    assert.equal(created.saleType, 'PRECO_FIXO');
    assert.equal(created.priceInCents, 24990);
    assert.equal(created.condition, 'PERFEITO_ESTADO');
    assert.equal(created.language, 'PT-BR');
    assert.equal(created.edition, 'Foil Nacional');
    assert.equal(created.status, 'DISPONIVEL');
    assert.equal(created.photos.length, 2);

    // Visitante sem login consulta listagem pública da carta
    const listRes = await app.inject({
      method: 'GET',
      url: `/listings?cardId=${cardId}`,
    });

    assert.equal(listRes.statusCode, 200);
    const listBody = listRes.json();
    assert.equal(listBody.items.length, 1);
    assert.equal(listBody.items[0].id, created.id);

    // Visitante sem login consulta detalhe do anúncio e fotos
    const detailRes = await app.inject({
      method: 'GET',
      url: `/listings/${created.id}`,
    });

    assert.equal(detailRes.statusCode, 200);
    assert.equal(detailRes.json().seller.name, 'Misty Waterflower');
    assert.equal(detailRes.json().photos.length, 2);
  });

  it('Autorização S3: emite Presigned GET URL para mídia pública e nega acesso a mídia privada de outro usuário', async () => {
    const seller = await registerAndLogin('Brock Harrison', 'brock@pokeshop.br');
    const visitorAuth = await registerAndLogin('Gary Oak', 'gary@pokeshop.br');

    // Cria anúncio público com foto
    const publicPhotoKey = `listings/${seller.user.id}/public-onix.jpg`;
    await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { authorization: `Bearer ${seller.token}` },
      payload: {
        cardId,
        saleType: 'PRECO_FIXO',
        priceInCents: 5500,
        condition: 'POUCO_USADA',
        language: 'PT-BR',
        photoKeys: [publicPhotoKey],
      },
    });

    // Registra mídia privada no banco de teste
    const privatePhotoKey = `posts/${seller.user.id}/private-binder.webp`;
    await seedPrivateMedia(seller.user.id, privatePhotoKey);

    // 1. Visitante sem login requisita URL pré-assinada da foto do anúncio público -> 200 OK
    const publicDownloadRes = await app.inject({
      method: 'GET',
      url: `/listings/media/presign-download?s3Key=${encodeURIComponent(publicPhotoKey)}`,
    });

    assert.equal(publicDownloadRes.statusCode, 200);
    assert.ok(
      publicDownloadRes
        .json()
        .downloadUrl.includes('https://s3-fake.pokeshop.test/download/')
    );

    // 2. Visitante sem login tenta obter URL pré-assinada da foto privada -> 403 Forbidden
    const anonPrivateRes = await app.inject({
      method: 'GET',
      url: `/listings/media/presign-download?s3Key=${encodeURIComponent(privatePhotoKey)}`,
    });
    assert.equal(anonPrivateRes.statusCode, 403);

    // 3. Outro usuário logado tenta obter URL pré-assinada da foto privada -> 403 Forbidden
    const otherUserPrivateRes = await app.inject({
      method: 'GET',
      url: `/listings/media/presign-download?s3Key=${encodeURIComponent(privatePhotoKey)}`,
      headers: { authorization: `Bearer ${visitorAuth.token}` },
    });
    assert.equal(otherUserPrivateRes.statusCode, 403);

    // 4. O próprio autor logado solicita URL pré-assinada da sua foto privada -> 200 OK
    const ownerPrivateRes = await app.inject({
      method: 'GET',
      url: `/listings/media/presign-download?s3Key=${encodeURIComponent(privatePhotoKey)}`,
      headers: { authorization: `Bearer ${seller.token}` },
    });
    assert.equal(ownerPrivateRes.statusCode, 200);
  });

  it('DELETE /listings/:id permite ao vendedor excluir anúncio DISPONIVEL, transicionando para CANCELADO', async () => {
    const seller = await registerAndLogin('Lance Dragon', 'lance@pokeshop.br');
    const intruder = await registerAndLogin('Equipe Rocket', 'rocket@pokeshop.br');

    const createRes = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { authorization: `Bearer ${seller.token}` },
      payload: {
        cardId,
        saleType: 'PRECO_FIXO',
        priceInCents: 19900,
        condition: 'MARCAS_DE_USO',
        language: 'PT-BR',
        photoKeys: [`listings/${seller.user.id}/dragonite.png`],
      },
    });

    const listingId = createRes.json().id as string;

    // Outro usuário não consegue cancelar -> 403
    const forbiddenDelete = await app.inject({
      method: 'DELETE',
      url: `/listings/${listingId}`,
      headers: { authorization: `Bearer ${intruder.token}` },
    });
    assert.equal(forbiddenDelete.statusCode, 403);

    // Vendedor dono cancela enquanto DISPONIVEL -> 200 CANCELADO
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/listings/${listingId}`,
      headers: { authorization: `Bearer ${seller.token}` },
    });

    assert.equal(deleteRes.statusCode, 200);
    assert.equal(deleteRes.json().status, 'CANCELADO');

    // Anúncio cancelado deixa de aparecer na listagem pública DISPONIVEL
    const listAfterCancel = await app.inject({
      method: 'GET',
      url: `/listings?cardId=${cardId}`,
    });
    assert.equal(listAfterCancel.json().items.length, 0);
  });

  it('Publica anúncio por propostas com Valor inicial mínimo, permite consulta pública por visitante e filtra por modalidade', async () => {
    const seller = await registerAndLogin('Cynthia Sinnoh', 'cynthia@pokeshop.br');

    // Rejeita anúncio PROPOSTAS sem startingPriceInCents ou com valor <= 0
    const missingStartRes = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { authorization: `Bearer ${seller.token}` },
      payload: {
        cardId,
        saleType: 'PROPOSTAS',
        condition: 'PERFEITO_ESTADO',
        language: 'PT-BR',
        photoKeys: [`listings/${seller.user.id}/garchomp.jpg`],
      },
    });
    assert.equal(missingStartRes.statusCode, 400);

    const zeroStartRes = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { authorization: `Bearer ${seller.token}` },
      payload: {
        cardId,
        saleType: 'PROPOSTAS',
        startingPriceInCents: 0,
        condition: 'PERFEITO_ESTADO',
        language: 'PT-BR',
        photoKeys: [`listings/${seller.user.id}/garchomp.jpg`],
      },
    });
    assert.equal(zeroStartRes.statusCode, 400);

    // Publica anúncio válido por Propostas
    const createRes = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { authorization: `Bearer ${seller.token}` },
      payload: {
        cardId,
        saleType: 'PROPOSTAS',
        startingPriceInCents: 18500,
        condition: 'POUCO_USADA',
        language: 'PT-BR',
        edition: 'Full Art Nacional',
        description: 'Aberto para propostas acima de R$ 185,00, sem prazo fixo.',
        photoKeys: [`listings/${seller.user.id}/garchomp-frente.jpg`],
      },
    });

    assert.equal(createRes.statusCode, 201);
    const created = createRes.json();
    assert.equal(created.saleType, 'PROPOSTAS');
    assert.equal(created.startingPriceInCents, 18500);
    assert.equal(created.priceInCents, 18500);
    assert.equal(created.status, 'DISPONIVEL');
    assert.equal(created.cardId, cardId);
    assert.equal(created.photos.length, 1);

    // Visitante sem login consulta listagem filtrada por PROPOSTAS
    const proposalsListRes = await app.inject({
      method: 'GET',
      url: `/listings?cardId=${cardId}&saleType=PROPOSTAS`,
    });
    assert.equal(proposalsListRes.statusCode, 200);
    assert.equal(proposalsListRes.json().items.length, 1);
    assert.equal(proposalsListRes.json().items[0].id, created.id);
    assert.equal(proposalsListRes.json().items[0].startingPriceInCents, 18500);

    // Visitante filtrando por PRECO_FIXO não vê o anúncio por propostas
    const fixedListRes = await app.inject({
      method: 'GET',
      url: `/listings?cardId=${cardId}&saleType=PRECO_FIXO`,
    });
    assert.equal(fixedListRes.statusCode, 200);
    assert.equal(fixedListRes.json().items.length, 0);

    // Visitante sem login consulta detalhe do anúncio público
    const detailRes = await app.inject({
      method: 'GET',
      url: `/listings/${created.id}`,
    });
    assert.equal(detailRes.statusCode, 200);
    assert.equal(detailRes.json().saleType, 'PROPOSTAS');
    assert.equal(detailRes.json().startingPriceInCents, 18500);
    assert.equal(detailRes.json().seller.name, 'Cynthia Sinnoh');
  });

  it('DELETE /listings/:id em anúncio PROPOSTAS DISPONIVEL leva a CANCELADO e descarta propostas pendentes', async () => {
    const seller = await registerAndLogin('Steven Stone', 'steven@pokeshop.br');
    const buyerA = await registerAndLogin('May Hoenn', 'may@pokeshop.br');
    const buyerB = await registerAndLogin('Brendan Hoenn', 'brendan@pokeshop.br');

    const createRes = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { authorization: `Bearer ${seller.token}` },
      payload: {
        cardId,
        saleType: 'PROPOSTAS',
        startingPriceInCents: 30000,
        condition: 'PERFEITO_ESTADO',
        language: 'PT-BR',
        photoKeys: [`listings/${seller.user.id}/metagross.webp`],
      },
    });
    assert.equal(createRes.statusCode, 201);
    const listingId = createRes.json().id as string;

    // Semeia 2 propostas pendentes (Cenário 3 do SPEC)
    await seedPendingProposals(listingId, [
      { buyerId: buyerA.user.id, amountInCents: 32000 },
      { buyerId: buyerB.user.id, amountInCents: 35000 },
    ]);

    // Comprador não pode excluir anúncio do vendedor -> 403
    const forbiddenRes = await app.inject({
      method: 'DELETE',
      url: `/listings/${listingId}`,
      headers: { authorization: `Bearer ${buyerA.token}` },
    });
    assert.equal(forbiddenRes.statusCode, 403);

    // Vendedor exclui anúncio DISPONIVEL -> 200 CANCELADO e propostas PENDENTE viram RECUSADA
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/listings/${listingId}`,
      headers: { authorization: `Bearer ${seller.token}` },
    });
    assert.equal(deleteRes.statusCode, 200);
    assert.equal(deleteRes.json().status, 'CANCELADO');

    const statuses = await getProposalStatuses(listingId);
    assert.deepEqual(statuses, ['RECUSADA', 'RECUSADA']);

    // Anúncio cancelado não aparece mais na vitrine pública
    const listAfterCancel = await app.inject({
      method: 'GET',
      url: `/listings?cardId=${cardId}&saleType=PROPOSTAS`,
    });
    assert.equal(listAfterCancel.statusCode, 200);
    assert.equal(listAfterCancel.json().items.length, 0);
  });
});
