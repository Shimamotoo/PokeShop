import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/pokeshop_test?schema=public';

process.env.DATABASE_URL = TEST_DATABASE_URL;

describe('Repositório Prisma de propostas', () => {
  let prisma: typeof import('@pokeshop/database').prisma;
  let createPrismaProposalsRepository: typeof import('./proposals.repository.js').createPrismaProposalsRepository;
  let cardId: string;
  let sellerId: string;
  let listingId: string;
  let firstProposalId: string;
  let secondProposalId: string;

  before(async () => {
    ({ prisma } = await import('@pokeshop/database'));
    ({ createPrismaProposalsRepository } = await import('./proposals.repository.js'));
    await prisma.$queryRaw`SELECT 1`;
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.chatMessage.deleteMany();
    await prisma.chatRoom.deleteMany();
    await prisma.proposal.deleteMany();
    await prisma.order.deleteMany();
    await prisma.listingPhoto.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.card.deleteMany();
    await prisma.user.deleteMany();

    const [seller, firstBuyer, secondBuyer, card] = await Promise.all([
      prisma.user.create({ data: { name: 'Vendedora', email: 'seller@proposal.test' } }),
      prisma.user.create({ data: { name: 'Comprador A', email: 'buyer-a@proposal.test' } }),
      prisma.user.create({ data: { name: 'Comprador B', email: 'buyer-b@proposal.test' } }),
      prisma.card.create({
        data: {
          tcgdexId: 'sv02-10', name: 'Charizard ex', setName: 'Evoluções em Paldea',
          cardNumber: '10', rarity: 'Rara dupla', imageUrl: 'https://assets.tcgdex.net/pt/sv/sv02/10',
        },
      }),
    ]);
    sellerId = seller.id;
    cardId = card.id;

    const listing = await prisma.listing.create({
      data: {
        cardId, sellerId, saleType: 'PROPOSTAS', priceInCents: 10000,
        startingPriceInCents: 10000, condition: 'PERFEITO_ESTADO', language: 'PT-BR',
      },
    });
    listingId = listing.id;

    const proposals = await prisma.proposal.createManyAndReturn({
      data: [
        { listingId, buyerId: firstBuyer.id, amountInCents: 12000 },
        { listingId, buyerId: secondBuyer.id, amountInCents: 13000 },
      ],
      select: { id: true },
    });
    [firstProposalId, secondProposalId] = proposals.map((proposal) => proposal.id);
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('aceita somente uma proposta concorrente e cria um único pedido e chat', async () => {
    const repository = createPrismaProposalsRepository(prisma);
    const now = new Date('2026-11-25T20:00:00.000Z');

    const results = await Promise.all([
      repository.acceptProposalAtomically({ proposalId: firstProposalId, now }),
      repository.acceptProposalAtomically({ proposalId: secondProposalId, now }),
    ]);

    assert.equal(results.filter(Boolean).length, 1);

    const [listing, proposals, orders, chatRooms] = await Promise.all([
      prisma.listing.findUniqueOrThrow({ where: { id: listingId } }),
      prisma.proposal.findMany({ where: { listingId }, orderBy: { amountInCents: 'asc' } }),
      prisma.order.findMany({ where: { listingId }, include: { chatRoom: true } }),
      prisma.chatRoom.findMany(),
    ]);

    assert.equal(listing.status, 'NEGOCIACAO_ABERTA');
    assert.equal(proposals.filter((proposal) => proposal.status === 'ACEITA').length, 1);
    assert.equal(proposals.filter((proposal) => proposal.status === 'RECUSADA').length, 1);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].status, 'NEGOCIACAO_ABERTA');
    assert.ok(orders[0].chatRoom);
    assert.equal(chatRooms.length, 1);
    assert.equal(orders[0].sellerId, sellerId);
  });
});
