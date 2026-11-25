import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthUserRepository, CreateUserRecordInput, StoredUserRecord } from '../auth/auth.service.js';
import type { StoredOrderRecord } from '../orders/orders.repository.js';
import type {
  AcceptProposalInput,
  CreateProposalInput,
  ProposalDecisionSnapshot,
  ProposalListingSnapshot,
  ProposalsRepository,
  StoredProposalRecord,
} from './proposals.repository.js';

function formatBirthDateForAge(yearsOld: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - yearsOld);
  return date.toISOString().slice(0, 10);
}

describe('Rotas HTTP de propostas', () => {
  let app: FastifyInstance;
  let listingId: string;
  let listing: ProposalListingSnapshot;
  let users: StoredUserRecord[];
  let proposals: Array<StoredProposalRecord & { listing: ProposalListingSnapshot }>;
  let orders: StoredOrderRecord[];

  const authRepository: AuthUserRepository = {
    async findByEmail(email) { return users.find((user) => user.email === email) ?? null; },
    async findById(id) { return users.find((user) => user.id === id) ?? null; },
    async findByGoogleId(googleId) { return users.find((user) => user.googleId === googleId) ?? null; },
    async create(data: CreateUserRecordInput) {
      const user: StoredUserRecord = {
        id: randomUUID(), name: data.name, email: data.email,
        passwordHash: data.passwordHash ?? null, birthDate: data.birthDate,
        termsAcceptedAt: data.termsAcceptedAt, googleId: data.googleId ?? null,
        role: 'USER', isBanned: false,
      };
      users.push(user);
      return user;
    },
    async linkGoogleId(userId, googleId) {
      const user = users.find((candidate) => candidate.id === userId);
      if (!user) throw new Error('User not found');
      user.googleId = googleId;
      return user;
    },
  };

  const proposalsRepository: ProposalsRepository = {
    async findListingForProposal(id) { return id === listing.id ? listing : null; },
    async createProposalAtomically(input: CreateProposalInput) {
      if (listing.status !== 'DISPONIVEL') return null;
      const buyer = users.find((user) => user.id === input.buyerId);
      if (!buyer) throw new Error('Buyer not found');
      const now = input.now;
      const proposal: StoredProposalRecord = {
        id: randomUUID(), listingId: input.listingId, buyerId: input.buyerId,
        amountInCents: input.amountInCents, status: 'PENDENTE',
        createdAt: now, updatedAt: now, buyer: { id: buyer.id, name: buyer.name },
      };
      proposals.push({ ...proposal, listing });
      return proposal;
    },
    async findProposalForDecision(id) { return proposals.find((proposal) => proposal.id === id) ?? null; },
    async findProposalsForSeller(id, sellerId) {
      if (id !== listing.id || sellerId !== listing.sellerId) return null;
      return proposals.filter((proposal) => proposal.listingId === id);
    },
    async acceptProposalAtomically(input: AcceptProposalInput) {
      const proposal = proposals.find((candidate) => candidate.id === input.proposalId);
      if (!proposal || proposal.status !== 'PENDENTE' || listing.status !== 'DISPONIVEL') return null;
      listing.status = 'NEGOCIACAO_ABERTA';
      proposal.status = 'ACEITA';
      proposal.updatedAt = input.now;
      for (const other of proposals) {
        if (other.listingId === listing.id && other.id !== proposal.id && other.status === 'PENDENTE') {
          other.status = 'RECUSADA';
          other.updatedAt = input.now;
        }
      }
      const buyer = users.find((user) => user.id === proposal.buyerId)!;
      const seller = users.find((user) => user.id === listing.sellerId)!;
      const order: StoredOrderRecord = {
        id: randomUUID(), listingId: listing.id, buyerId: buyer.id, sellerId: seller.id,
        status: 'NEGOCIACAO_ABERTA', confirmedAt: input.now, soldAt: null,
        cancelledAt: null, createdAt: input.now, updatedAt: input.now,
        buyer: { id: buyer.id, name: buyer.name }, seller: { id: seller.id, name: seller.name },
        chatRoom: { id: randomUUID() },
        listing: {
          id: listing.id, saleType: 'PROPOSTAS', priceInCents: listing.startingPriceInCents ?? 0,
          condition: 'PERFEITO_ESTADO', language: 'PT-BR', edition: null,
          status: 'NEGOCIACAO_ABERTA', card: {
            id: randomUUID(), tcgdexId: 'sv02-10', name: 'Charizard ex',
            setName: 'Evoluções em Paldea', cardNumber: '10', rarity: 'Rara dupla', imageUrl: null,
          },
        },
      };
      orders.push(order);
      return order;
    },
    async declineProposalAtomically(id, now) {
      const proposal = proposals.find((candidate) => candidate.id === id && candidate.status === 'PENDENTE');
      if (!proposal) return null;
      proposal.status = 'RECUSADA';
      proposal.updatedAt = now;
      return proposal;
    },
  };

  before(async () => {
    const { buildApp } = await import('../../app.js');
    users = [];
    proposals = [];
    orders = [];
    app = buildApp({
      logger: false,
      auth: { authRepository },
      proposals: { proposalsRepository },
    });
    await app.ready();
  });

  beforeEach(() => {
    users.length = 0;
    proposals.length = 0;
    orders.length = 0;
    listingId = randomUUID();
    listing = { id: listingId, sellerId: '', saleType: 'PROPOSTAS', status: 'DISPONIVEL', startingPriceInCents: 10000 };
  });

  after(async () => { await app.close(); });

  async function register(name: string, email: string) {
    const response = await app.inject({ method: 'POST', url: '/auth/register', payload: {
      name, email, password: 'password-123', birthDate: formatBirthDateForAge(22), termsAccepted: true,
    } });
    assert.equal(response.statusCode, 201);
    return response.json() as { token: string; user: { id: string; name: string } };
  }

  async function setupUsers() {
    const seller = await register('Vendedora', 'seller@pokeshop.test');
    const buyer = await register('Comprador', 'buyer@pokeshop.test');
    const buyerTwo = await register('Outra pessoa', 'buyer2@pokeshop.test');
    const stranger = await register('Terceira pessoa', 'stranger@pokeshop.test');
    listing.sellerId = seller.user.id;
    return { seller, buyer, buyerTwo, stranger };
  }

  it('exige login e aceita somente valor estritamente acima do valor inicial', async () => {
    const { buyer } = await setupUsers();
    assert.equal((await app.inject({ method: 'POST', url: `/listings/${listingId}/proposals`, payload: { amountInCents: 10001 } })).statusCode, 401);
    for (const amountInCents of [10000, 9999]) {
      const response = await app.inject({ method: 'POST', url: `/listings/${listingId}/proposals`, headers: { authorization: `Bearer ${buyer.token}` }, payload: { amountInCents } });
      assert.equal(response.statusCode, 400);
    }
    const accepted = await app.inject({ method: 'POST', url: `/listings/${listingId}/proposals`, headers: { authorization: `Bearer ${buyer.token}` }, payload: { amountInCents: 10001 } });
    assert.equal(accepted.statusCode, 201);
    assert.equal(accepted.json().amountInCents, 10001);
  });

  it('limita leitura e decisão ao vendedor e ao dono da proposta, aceitando uma única proposta', async () => {
    const { seller, buyer, buyerTwo, stranger } = await setupUsers();
    const submit = async (token: string, amountInCents: number) => app.inject({
      method: 'POST', url: `/listings/${listingId}/proposals`,
      headers: { authorization: `Bearer ${token}` }, payload: { amountInCents },
    });
    const first = await submit(buyer.token, 12000);
    const second = await submit(buyerTwo.token, 14000);
    const firstId = first.json().id as string;
    const secondId = second.json().id as string;

    assert.equal((await app.inject({ method: 'GET', url: `/listings/${listingId}/proposals`, headers: { authorization: `Bearer ${stranger.token}` } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: `/proposals/${firstId}/accept`, headers: { authorization: `Bearer ${stranger.token}` } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: `/proposals/${firstId}/decline`, headers: { authorization: `Bearer ${stranger.token}` } })).statusCode, 403);

    const [firstDecision, competingDecision] = await Promise.all([
      app.inject({ method: 'POST', url: `/proposals/${firstId}/accept`, headers: { authorization: `Bearer ${seller.token}` } }),
      app.inject({ method: 'POST', url: `/proposals/${secondId}/accept`, headers: { authorization: `Bearer ${seller.token}` } }),
    ]);
    const successfulDecision = firstDecision.statusCode === 200 ? firstDecision : competingDecision;
    const rejectedDecision = firstDecision.statusCode === 409 ? firstDecision : competingDecision;
    assert.equal(successfulDecision.statusCode, 200);
    assert.equal(rejectedDecision.statusCode, 409);
    assert.ok([buyer.user.id, buyerTwo.user.id].includes(successfulDecision.json().buyerId));
    assert.equal(listing.status, 'NEGOCIACAO_ABERTA');
    assert.equal(proposals.filter((proposal) => proposal.status === 'ACEITA').length, 1);
    assert.equal(proposals.filter((proposal) => proposal.status === 'RECUSADA').length, 1);
    assert.equal(orders.length, 1);
    assert.ok(successfulDecision.json().chatRoomId);
    assert.equal(orders.length, 1);
  });

  it('permite ao vendedor recusar uma proposta pendente', async () => {
    const { seller, buyer } = await setupUsers();
    const created = await app.inject({ method: 'POST', url: `/listings/${listingId}/proposals`, headers: { authorization: `Bearer ${buyer.token}` }, payload: { amountInCents: 15000 } });
    const response = await app.inject({ method: 'POST', url: `/proposals/${created.json().id}/decline`, headers: { authorization: `Bearer ${seller.token}` } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'RECUSADA');
  });
});
