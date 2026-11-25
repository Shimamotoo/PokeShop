import type { CreateProposalInput, OrderView, ProposalView } from '@pokeshop/shared';
import { toOrderView } from '../orders/orders.service.js';
import type { Clock, ProposalsRepository, StoredProposalRecord } from './proposals.repository.js';

export class ProposalError extends Error {
  constructor(message: string, public readonly statusCode: 400 | 403 | 404 | 409) {
    super(message);
    this.name = 'ProposalError';
  }
}

function toProposalView(proposal: StoredProposalRecord): ProposalView {
  return {
    id: proposal.id,
    listingId: proposal.listingId,
    buyerId: proposal.buyerId,
    amountInCents: proposal.amountInCents,
    status: proposal.status,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    buyer: proposal.buyer,
  };
}

export async function submitProposal(
  listingId: string,
  buyerId: string,
  input: CreateProposalInput,
  repository: ProposalsRepository,
  clock: Clock = () => new Date()
): Promise<ProposalView> {
  const listing = await repository.findListingForProposal(listingId);
  if (!listing) throw new ProposalError('Anúncio não encontrado.', 404);
  if (listing.sellerId === buyerId) {
    throw new ProposalError('O vendedor não pode enviar proposta ao próprio anúncio.', 403);
  }
  if (listing.saleType !== 'PROPOSTAS') {
    throw new ProposalError('Este anúncio não recebe propostas.', 400);
  }
  if (listing.status !== 'DISPONIVEL') {
    throw new ProposalError('Este anúncio não está disponível para propostas.', 409);
  }
  if (input.amountInCents <= (listing.startingPriceInCents ?? 0)) {
    throw new ProposalError('A proposta deve ser estritamente maior que o valor inicial.', 400);
  }

  const created = await repository.createProposalAtomically({
    listingId,
    buyerId,
    amountInCents: input.amountInCents,
    now: clock(),
  });
  if (!created) {
    throw new ProposalError('Este anúncio não está mais disponível para propostas.', 409);
  }
  return toProposalView(created);
}

export async function listSellerProposals(
  listingId: string,
  sellerId: string,
  repository: ProposalsRepository
): Promise<ProposalView[]> {
  const proposals = await repository.findProposalsForSeller(listingId, sellerId);
  if (!proposals) throw new ProposalError('Você não tem permissão para ver as propostas deste anúncio.', 403);
  return proposals.map(toProposalView);
}

export async function acceptProposal(
  proposalId: string,
  sellerId: string,
  repository: ProposalsRepository,
  clock: Clock = () => new Date()
): Promise<OrderView> {
  const proposal = await repository.findProposalForDecision(proposalId);
  if (!proposal) throw new ProposalError('Proposta não encontrada.', 404);
  if (proposal.listing.sellerId !== sellerId) {
    throw new ProposalError('Apenas o vendedor pode aceitar esta proposta.', 403);
  }
  if (proposal.status !== 'PENDENTE' || proposal.listing.status !== 'DISPONIVEL') {
    throw new ProposalError('Esta proposta não pode mais ser aceita.', 409);
  }

  const order = await repository.acceptProposalAtomically({ proposalId, now: clock() });
  if (!order) throw new ProposalError('Esta proposta foi alterada por outra requisição.', 409);
  return toOrderView(order);
}

export async function declineProposal(
  proposalId: string,
  sellerId: string,
  repository: ProposalsRepository,
  clock: Clock = () => new Date()
): Promise<ProposalView> {
  const proposal = await repository.findProposalForDecision(proposalId);
  if (!proposal) throw new ProposalError('Proposta não encontrada.', 404);
  if (proposal.listing.sellerId !== sellerId) {
    throw new ProposalError('Apenas o vendedor pode recusar esta proposta.', 403);
  }
  if (proposal.status !== 'PENDENTE') {
    throw new ProposalError('Apenas propostas pendentes podem ser recusadas.', 409);
  }

  const declined = await repository.declineProposalAtomically(proposalId, clock());
  if (!declined) throw new ProposalError('Esta proposta foi alterada por outra requisição.', 409);
  return toProposalView(declined);
}
