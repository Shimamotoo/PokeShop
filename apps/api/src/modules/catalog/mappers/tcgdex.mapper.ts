import type { CatalogCardSeed } from '../catalog.types.js';

export function mapTcgdexCard(input: unknown): CatalogCardSeed | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  const card = input as Record<string, unknown>;
  const set = card.set;

  if (typeof set !== 'object' || set === null) {
    return null;
  }

  const setData = set as Record<string, unknown>;
  const tcgdexId = card.id;
  const name = card.name;
  const setName = setData.name;
  const localId = card.localId;
  const rarity = card.rarity;
  const image = card.image;

  if (
    typeof tcgdexId !== 'string' || !tcgdexId.trim() ||
    typeof name !== 'string' || !name.trim() ||
    typeof setName !== 'string' || !setName.trim() ||
    (typeof localId !== 'string' && typeof localId !== 'number') ||
    String(localId).trim() === '' ||
    typeof rarity !== 'string' || !rarity.trim()
  ) {
    return null;
  }

  return {
    tcgdexId: tcgdexId.trim(),
    name: name.trim(),
    setName: setName.trim(),
    cardNumber: String(localId).trim(),
    rarity: rarity.trim(),
    imageUrl: typeof image === 'string' && image.trim() ? image.trim() : null,
  };
}
