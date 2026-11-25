import type { PrismaClient } from "@pokeshop/database";
import type {
  ListingSaleType,
  OrderStatusType,
  ProposalStatus,
} from "@pokeshop/shared";
import type { StoredOrderRecord } from "../orders/orders.repository.js";

export type Clock = () => Date;

export type StoredProposalRecord = {
  id: string;
  listingId: string;
  buyerId: string;
  amountInCents: number;
  status: ProposalStatus;
  createdAt: Date;
  updatedAt: Date;
  buyer: { id: string; name: string };
};

export type ProposalListingSnapshot = {
  id: string;
  sellerId: string;
  saleType: ListingSaleType;
  status: OrderStatusType;
  startingPriceInCents: number | null;
};

export type ProposalDecisionSnapshot = StoredProposalRecord & {
  listing: ProposalListingSnapshot;
};

export type CreateProposalInput = {
  listingId: string;
  buyerId: string;
  amountInCents: number;
  now: Date;
};

export type AcceptProposalInput = {
  proposalId: string;
  now: Date;
};

class ProposalAcceptanceConflictError extends Error {
  constructor() {
    super('PROPOSAL_ACCEPTANCE_CONFLICT');
    this.name = 'ProposalAcceptanceConflictError';
  }
}

export interface ProposalsRepository {
  findListingForProposal(
    listingId: string,
  ): Promise<ProposalListingSnapshot | null>;
  createProposalAtomically(
    input: CreateProposalInput,
  ): Promise<StoredProposalRecord | null>;
  findProposalForDecision(
    proposalId: string,
  ): Promise<ProposalDecisionSnapshot | null>;
  findProposalsForSeller(
    listingId: string,
    sellerId: string,
  ): Promise<StoredProposalRecord[] | null>;
  acceptProposalAtomically(
    input: AcceptProposalInput,
  ): Promise<StoredOrderRecord | null>;
  declineProposalAtomically(
    proposalId: string,
    now: Date,
  ): Promise<StoredProposalRecord | null>;
}

const proposalInclude = {
  buyer: { select: { id: true, name: true } },
} as const;

const orderInclude = {
  buyer: { select: { id: true, name: true } },
  seller: { select: { id: true, name: true } },
  chatRoom: { select: { id: true } },
  listing: {
    select: {
      id: true,
      saleType: true,
      priceInCents: true,
      condition: true,
      language: true,
      edition: true,
      status: true,
      card: {
        select: {
          id: true,
          tcgdexId: true,
          name: true,
          setName: true,
          cardNumber: true,
          rarity: true,
          imageUrl: true,
        },
      },
    },
  },
} as const;

export function createPrismaProposalsRepository(
  prisma: PrismaClient,
): ProposalsRepository {
  return {
    async findListingForProposal(listingId) {
      return prisma.listing.findUnique({
        where: { id: listingId },
        select: {
          id: true,
          sellerId: true,
          saleType: true,
          status: true,
          startingPriceInCents: true,
        },
      });
    },

    async createProposalAtomically(input) {
      return prisma.$transaction(async (tx) => {
        const listing = await tx.listing.updateMany({
          where: {
            id: input.listingId,
            saleType: "PROPOSTAS",
            status: "DISPONIVEL",
          },
          data: { updatedAt: input.now },
        });
        if (listing.count === 0) return null;

        return tx.proposal.create({
          data: {
            listingId: input.listingId,
            buyerId: input.buyerId,
            amountInCents: input.amountInCents,
            createdAt: input.now,
            updatedAt: input.now,
          },
          include: proposalInclude,
        });
      });
    },

    async findProposalForDecision(proposalId) {
      return prisma.proposal.findUnique({
        where: { id: proposalId },
        include: {
          ...proposalInclude,
          listing: {
            select: {
              id: true,
              sellerId: true,
              saleType: true,
              status: true,
              startingPriceInCents: true,
            },
          },
        },
      });
    },

    async findProposalsForSeller(listingId, sellerId) {
      const listing = await prisma.listing.findFirst({
        where: { id: listingId, sellerId },
        select: { id: true },
      });
      if (!listing) return null;

      return prisma.proposal.findMany({
        where: { listingId },
        orderBy: [
          { status: "asc" },
          { amountInCents: "desc" },
          { createdAt: "asc" },
        ],
        include: proposalInclude,
      });
    },

    async acceptProposalAtomically(input) {
      try {
        return await prisma.$transaction(async (tx) => {
        const proposal = await tx.proposal.findUnique({
          where: { id: input.proposalId },
          select: {
            id: true,
            listingId: true,
            buyerId: true,
            status: true,
            listing: {
              select: { sellerId: true },
            },
          },
        });

        if (!proposal || proposal.status !== "PENDENTE") {
          return null;
        }

        const updatedListing = await tx.listing.updateMany({
          where: {
            id: proposal.listingId,
            status: "DISPONIVEL",
            saleType: "PROPOSTAS",
          },
          data: {
            status: "NEGOCIACAO_ABERTA",
            updatedAt: input.now,
          },
        });

        if (updatedListing.count === 0) {
          throw new ProposalAcceptanceConflictError();
        }

        const acceptedProposal = await tx.proposal.updateMany({
          where: { id: proposal.id, status: "PENDENTE" },
          data: {
            status: "ACEITA",
            updatedAt: input.now,
          },
        });
        if (acceptedProposal.count === 0) {
          throw new ProposalAcceptanceConflictError();
        }

        await tx.proposal.updateMany({
          where: {
            listingId: proposal.listingId,
            status: "PENDENTE",
            id: { not: proposal.id },
          },
          data: {
            status: "RECUSADA",
            updatedAt: input.now,
          },
        });

        const order = await tx.order.create({
          data: {
            listingId: proposal.listingId,
            buyerId: proposal.buyerId,
            sellerId: proposal.listing.sellerId,
            status: "NEGOCIACAO_ABERTA",
            createdAt: input.now,
            updatedAt: input.now,
          },
          include: orderInclude,
        });

        await tx.chatRoom.create({
          data: {
            orderId: order.id,
            lastMessageAt: input.now,
            createdAt: input.now,
            updatedAt: input.now,
          },
        });

        return order;
        });
      } catch (error) {
        if (error instanceof ProposalAcceptanceConflictError) return null;
        throw error;
      }
    },

    async declineProposalAtomically(proposalId, now) {
      const updated = await prisma.proposal.updateMany({
        where: { id: proposalId, status: "PENDENTE" },
        data: { status: "RECUSADA", updatedAt: now },
      });
      if (updated.count === 0) return null;
      return prisma.proposal.findUnique({
        where: { id: proposalId },
        include: proposalInclude,
      });
    },
  };
}
