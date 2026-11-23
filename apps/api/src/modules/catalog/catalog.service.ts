import type { CatalogCardSeed } from './catalog.types.js';
import { mapTcgdexCard } from './mappers/tcgdex.mapper.js';
import type { TcgdexClient } from './integrations/tcgdex.client.js';

type CatalogRepository = {
  upsert(card: CatalogCardSeed): Promise<void>;
};

export type CatalogSyncResult = {
  imported: number;
  ignored: number;
};

function extractId(card: unknown): string | null {
  if (typeof card !== 'object' || card === null) return null;
  const id = (card as Record<string, unknown>).id;
  return typeof id === 'string' && id.trim() ? id : null;
}

export async function syncCatalog(
  client: TcgdexClient,
  repository: CatalogRepository
): Promise<CatalogSyncResult> {
  const summaries = await client.listCards();
  let imported = 0;
  let ignored = 0;

  // A listagem traz resumos; a raridade e a coleção exigem a carta completa.
  for (const summary of summaries) {
    const id = extractId(summary);
    if (!id) {
      ignored += 1;
      continue;
    }

    const seed = mapTcgdexCard(await client.getCard(id));
    if (!seed) {
      ignored += 1;
      continue;
    }

    await repository.upsert(seed);
    imported += 1;
  }

  return { imported, ignored };
}
