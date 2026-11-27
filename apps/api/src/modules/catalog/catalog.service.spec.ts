import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { syncCatalog } from './catalog.service.js';
import type { CatalogCardSeed } from './catalog.types.js';
import type { TcgdexClient } from './integrations/tcgdex.client.js';

describe('syncCatalog', () => {
  it('importa cartas válidas e ignora cartas sem raridade', async () => {
    const cardsById: Record<string, unknown> = {
      'sv01-25': {
        id: 'sv01-25',
        name: 'Pikachu',
        localId: '25',
        rarity: 'Common',
        image: 'https://assets.tcgdex.net/pt/sv/sv01/25',
        set: { name: 'Escarlate e Violeta' },
      },
      'sv01-26': {
        id: 'sv01-26',
        name: 'Raichu',
        localId: '26',
        image: 'https://assets.tcgdex.net/pt/sv/sv01/26',
        set: { name: 'Escarlate e Violeta' },
      },
    };

    const fakeClient: TcgdexClient = {
      async listCards() {
        return [{ id: 'sv01-25' }, { id: 'sv01-26' }];
      },
      async getCard(id) {
        return cardsById[id];
      },
    };

    const savedCards: CatalogCardSeed[] = [];
    const fakeRepository = {
      async upsert(card: CatalogCardSeed) {
        savedCards.push(card);
      },
    };

    const result = await syncCatalog(fakeClient, fakeRepository);

    assert.deepEqual(result, { imported: 1, ignored: 1 });
    assert.deepEqual(savedCards, [
      {
        tcgdexId: 'sv01-25',
        name: 'Pikachu',
        setName: 'Escarlate e Violeta',
        cardNumber: '25',
        rarity: 'Common',
        imageUrl: 'https://assets.tcgdex.net/pt/sv/sv01/25',
      },
    ]);
  });

  it('repassa o setId para listCards quando informado', async () => {
    let receivedSetId: string | undefined;

    const fakeClient: TcgdexClient = {
      async listCards(setId) {
        receivedSetId = setId;
        return [];
      },
      async getCard() {
        return null;
      },
    };

    const result = await syncCatalog(
      fakeClient,
      { async upsert() {} },
      { setId: '30th' }
    );

    assert.equal(receivedSetId, '30th');
    assert.deepEqual(result, { imported: 0, ignored: 0 });
  });
});
