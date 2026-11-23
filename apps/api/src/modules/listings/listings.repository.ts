import type { PrismaClient } from '@pokeshop/database';
import type { CardConditionType, ListingSaleType, OrderStatusType } from '@pokeshop/shared';

export type StoredCardSummary = {
  id: string;
  tcgdexId: string;
  name: string;
  setName: string;
  cardNumber: string;
  rarity: string;
  imageUrl: string | null;
};

export type StoredListingPhoto = {
  id: string;
  s3Key: string;
  orderIndex: number;
};

export type StoredListingSeller = {
  id: string;
  name: string;
  profileVisibility: 'PUBLIC' | 'PRIVATE';
};

export type StoredListingRecord = {
  id: string;
  cardId: string;
  sellerId: string;
  saleType: ListingSaleType;
  priceInCents: number;
  startingPriceInCents: number | null;
  condition: CardConditionType;
  language: string;
  edition: string | null;
  description: string | null;
  status: OrderStatusType;
  createdAt: Date;
  updatedAt: Date;
  card: StoredCardSummary;
  seller: StoredListingSeller;
  photos: StoredListingPhoto[];
};

export type CreateListingRecordInput = {
  cardId: string;
  sellerId: string;
  saleType: ListingSaleType;
  priceInCents: number;
  startingPriceInCents?: number | null;
  condition: CardConditionType;
  language: string;
  edition: string | null;
  description: string | null;
  photoKeys: string[];
};

export type FindListingsFilter = {
  cardId?: string;
  tcgdexId?: string;
  sellerId?: string;
  status?: OrderStatusType;
};

export type MediaAccessContext = {
  s3Key: string;
  ownerId: string;
  visibility: 'PUBLIC' | 'PRIVATE';
};

export interface ListingsRepository {
  findCardById(cardId: string): Promise<StoredCardSummary | null>;
  create(data: CreateListingRecordInput): Promise<StoredListingRecord>;
  findById(listingId: string): Promise<StoredListingRecord | null>;
  findMany(filter: FindListingsFilter): Promise<StoredListingRecord[]>;
  cancelListing(listingId: string): Promise<StoredListingRecord>;
  findMediaAccessContext(s3Key: string): Promise<MediaAccessContext | null>;
}

const listingInclude = {
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
  seller: {
    select: {
      id: true,
      name: true,
      profileVisibility: true,
    },
  },
  photos: {
    orderBy: {
      orderIndex: 'asc' as const,
    },
    select: {
      id: true,
      s3Key: true,
      orderIndex: true,
    },
  },
};

export function createPrismaListingsRepository(prisma: PrismaClient): ListingsRepository {
  return {
    async findCardById(cardId: string): Promise<StoredCardSummary | null> {
      return prisma.card.findUnique({
        where: { id: cardId },
        select: {
          id: true,
          tcgdexId: true,
          name: true,
          setName: true,
          cardNumber: true,
          rarity: true,
          imageUrl: true,
        },
      });
    },

    async create(data: CreateListingRecordInput): Promise<StoredListingRecord> {
      return prisma.listing.create({
        data: {
          cardId: data.cardId,
          sellerId: data.sellerId,
          saleType: data.saleType,
          priceInCents: data.priceInCents,
          startingPriceInCents: data.startingPriceInCents ?? null,
          condition: data.condition,
          language: data.language,
          edition: data.edition,
          description: data.description,
          status: 'DISPONIVEL',
          photos: {
            create: data.photoKeys.map((s3Key, index) => ({
              s3Key,
              orderIndex: index,
            })),
          },
        },
        include: listingInclude,
      });
    },

    async findById(listingId: string): Promise<StoredListingRecord | null> {
      return prisma.listing.findUnique({
        where: { id: listingId },
        include: listingInclude,
      });
    },

    async findMany(filter: FindListingsFilter): Promise<StoredListingRecord[]> {
      return prisma.listing.findMany({
        where: {
          ...(filter.cardId ? { cardId: filter.cardId } : {}),
          ...(filter.tcgdexId ? { card: { tcgdexId: filter.tcgdexId } } : {}),
          ...(filter.sellerId ? { sellerId: filter.sellerId } : {}),
          ...(filter.status ? { status: filter.status } : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        include: listingInclude,
      });
    },

    async cancelListing(listingId: string): Promise<StoredListingRecord> {
      return prisma.$transaction(async (tx) => {
        await tx.proposal.updateMany({
          where: {
            listingId,
            status: 'PENDENTE',
          },
          data: {
            status: 'RECUSADA',
          },
        });

        return tx.listing.update({
          where: { id: listingId },
          data: { status: 'CANCELADO' },
          include: listingInclude,
        });
      });
    },

    async findMediaAccessContext(s3Key: string): Promise<MediaAccessContext | null> {
      const listingPhoto = await prisma.listingPhoto.findFirst({
        where: { s3Key },
        include: {
          listing: {
            include: {
              seller: {
                select: {
                  id: true,
                  profileVisibility: true,
                },
              },
            },
          },
        },
      });

      if (listingPhoto) {
        const isPublicListing =
          listingPhoto.listing.status !== 'CANCELADO' &&
          listingPhoto.listing.seller.profileVisibility === 'PUBLIC';

        return {
          s3Key: listingPhoto.s3Key,
          ownerId: listingPhoto.listing.sellerId,
          visibility: isPublicListing ? 'PUBLIC' : 'PRIVATE',
        };
      }

      const postPhoto = await prisma.postPhoto.findFirst({
        where: { s3Key },
        include: {
          post: {
            select: {
              authorId: true,
              visibility: true,
            },
          },
        },
      });

      if (postPhoto) {
        return {
          s3Key: postPhoto.s3Key,
          ownerId: postPhoto.post.authorId,
          visibility: postPhoto.post.visibility,
        };
      }

      return null;
    },
  };
}
