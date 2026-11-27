import 'dotenv/config';
import { prisma } from '@pokeshop/database';
import { syncCatalog } from '../modules/catalog/catalog.service.js';
import { createTcgdexClient } from '../modules/catalog/integrations/tcgdex.client.js';

const repository = {
  async upsert(card: {
    tcgdexId: string;
    name: string;
    setName: string;
    cardNumber: string;
    rarity: string;
    imageUrl: string | null;
  }) {
    await prisma.card.upsert({
      where: { tcgdexId: card.tcgdexId },
      create: card,
      update: card,
    });
  },
};

function resolveSetId(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--set' && argv[index + 1]) {
      return argv[index + 1].trim() || undefined;
    }
    if (arg.startsWith('--set=')) {
      return arg.slice('--set='.length).trim() || undefined;
    }
    if (!arg.startsWith('-')) {
      return arg.trim() || undefined;
    }
  }

  return process.env.TCGDEX_SET_ID?.trim() || undefined;
}

const setId = resolveSetId(process.argv.slice(2));

try {
  const result = await syncCatalog(createTcgdexClient(), repository, { setId });
  const scope = setId ? ` (expansão ${setId})` : '';
  console.info(`Catálogo sincronizado${scope}: ${result.imported} importadas, ${result.ignored} ignoradas.`);
} finally {
  await prisma.$disconnect();
}
