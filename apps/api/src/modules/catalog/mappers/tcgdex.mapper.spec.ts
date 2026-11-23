import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapTcgdexCard } from './tcgdex.mapper.js';
import type { CatalogCardSeed } from '../catalog.types.js';
import { syncCatalog } from '../catalog.service.js';
import { TcgdexClient } from '../integrations/tcgdex.client.js';

describe('mapTcgdexCard', () => {
  it('converte uma carta válida para o formato do catálogo', () => {

    const input = {
      id: 'sv01-25',
      name: 'Pikachu',
      localId: 25,
      rarity: 'Common',
      image: 'https://assets.tcgdex.net/pt/sv/sv01/25',
      set: {
        name: 'Escarlate e Violeta'
      }
    };

    const mappedCard = mapTcgdexCard(input);

    assert.deepEqual(mappedCard, {
      tcgdexId: 'sv01-25',
      name: 'Pikachu',
      setName: 'Escarlate e Violeta',
      cardNumber: '25',
      rarity: 'Common',
      imageUrl: 'https://assets.tcgdex.net/pt/sv/sv01/25'
    });
  });

  it('campos obrigatórios não presentes no input devem retornar null', () => {
    const input = {
      id: 'sv01-25',
      name: 'Pikachu',
      localId: 25,
      image: 'https://assets.tcgdex.net/pt/sv/sv01/25',
      set: {
        name: 'Escarlate e Violeta'
      }
    };

    const mappedCard = mapTcgdexCard(input);
    assert.equal(mappedCard, null);
  });
});