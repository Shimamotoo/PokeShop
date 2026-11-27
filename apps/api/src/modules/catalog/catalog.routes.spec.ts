import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { syncCatalog } from './catalog.service.js';
import type { CatalogCardSeed } from './catalog.types.js';
import type { TcgdexClient } from './integrations/tcgdex.client.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/pokeshop_test?schema=public';

process.env.DATABASE_URL = TEST_DATABASE_URL;

describe('Rotas HTTP do catálogo', () => {
  let app: FastifyInstance;

  before(async () => {
    const [{ buildApp }, { prisma }] = await Promise.all([
      import('../../app.js'),
      import('@pokeshop/database'),
    ]);

    await prisma.notification.deleteMany();
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

    const cardsById: Record<string, unknown> = {
      'sv01-25': {
        id: 'sv01-25',
        name: 'Pikachu',
        localId: '25',
        rarity: 'Common',
        image: 'https://assets.tcgdex.net/pt/sv/sv01/25',
        set: { name: 'Escarlate e Violeta' },
      },
      'sv02-10': {
        id: 'sv02-10',
        name: 'Charizard',
        localId: '10',
        rarity: 'Rare',
        image: 'https://assets.tcgdex.net/pt/sv/sv02/10',
        set: { name: 'Evoluções em Paldea' },
      },
    };

    const fakeClient: TcgdexClient = {
      async listCards() {
        return [{ id: 'sv01-25' }, { id: 'sv02-10' }];
      },
      async getCard(id) {
        return cardsById[id];
      },
    };

    const repository = {
      async upsert(card: CatalogCardSeed) {
        await prisma.card.upsert({
          where: { tcgdexId: card.tcgdexId },
          create: card,
          update: card,
        });
      },
    };

    await syncCatalog(fakeClient, repository);

    app = buildApp();
    await app.ready();
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /catalog/cards retorna as cartas sincronizadas do banco de teste', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/catalog/cards',
    });

    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(body.total, 2);
    assert.equal(body.page, 1);
    assert.equal(body.items.length, 2);
    assert.deepEqual(
      body.items.map((item: { tcgdexId: string }) => item.tcgdexId),
      ['sv01-25', 'sv02-10']
    );
  });

  it('GET /catalog/cards?q=... filtra cartas por nome, coleção ou número', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/catalog/cards?q=charizard',
    });

    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(body.total, 1);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].tcgdexId, 'sv02-10');
  });

  it('GET /catalog/cards/:tcgdexId retorna 200 para carta existente e 404 para inexistente', async () => {
    const foundResponse = await app.inject({
      method: 'GET',
      url: '/catalog/cards/sv01-25',
    });

    assert.equal(foundResponse.statusCode, 200);
    const foundBody = foundResponse.json();
    assert.equal(foundBody.name, 'Pikachu');
    assert.equal(foundBody.rarity, 'Common');

    const notFoundResponse = await app.inject({
      method: 'GET',
      url: '/catalog/cards/nao-existe',
    });

    assert.equal(notFoundResponse.statusCode, 404);
    assert.equal(notFoundResponse.json().message, 'Carta não encontrada no catálogo.');
  });
});
