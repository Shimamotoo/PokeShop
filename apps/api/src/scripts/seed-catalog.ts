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

try {
  const result = await syncCatalog(createTcgdexClient(), repository);
  console.info(`Catálogo sincronizado: ${result.imported} importadas, ${result.ignored} ignoradas.`);
} finally {
  await prisma.$disconnect();
}
