import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createListingSchema,
  listingResponseSchema,
  listListingsQuerySchema,
  listListingsResponseSchema,
  presignDownloadResponseSchema,
  presignUploadRequestSchema,
  presignUploadResponseSchema,
} from '@pokeshop/shared';
import { z } from 'zod';
import type { AppJwtPayload } from '../../plugins/auth.plugin.js';
import {
  createPrismaListingsRepository,
  type ListingsRepository,
} from './listings.repository.js';
import {
  authorizeAndSignMediaRead,
  cancelListing,
  getListingDetails,
  ListingError,
  listListings,
  publishListing,
  requestPhotoUploadPresign,
} from './listings.service.js';
import {
  createS3StorageProvider,
  type S3StorageProvider,
} from './s3-storage.provider.js';

export type ListingsRoutesOptions = {
  listingsRepository?: ListingsRepository;
  s3Storage?: S3StorageProvider;
};

const errorResponseSchema = z.object({
  message: z.string(),
});

async function resolveOptionalUserId(request: FastifyRequest): Promise<string | null> {
  if (!request.headers.authorization) {
    return null;
  }

  try {
    const payload = await request.jwtVerify<AppJwtPayload>();
    return payload.purpose === 'session' ? payload.sub : null;
  } catch {
    return null;
  }
}

export const listingsRoutes: FastifyPluginAsyncZod<ListingsRoutesOptions> = async (
  fastify,
  options
) => {
  const repository =
    options.listingsRepository ?? createPrismaListingsRepository(fastify.prisma);
  const s3Storage = options.s3Storage ?? createS3StorageProvider();

  fastify.post(
    '/listings/media/presign-upload',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: presignUploadRequestSchema,
        response: {
          201: presignUploadResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await requestPhotoUploadPresign(
          request.user.sub,
          request.body,
          s3Storage
        );
        return reply.code(201).send(result);
      } catch (error) {
        if (error instanceof ListingError && error.statusCode === 400) {
          return reply.code(400).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.get(
    '/listings/media/presign-download',
    {
      schema: {
        querystring: z.object({
          s3Key: z.string().trim().min(1, 'Chave S3 é obrigatória.'),
        }),
        response: {
          200: presignDownloadResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const requesterUserId = await resolveOptionalUserId(request);

      try {
        const signed = await authorizeAndSignMediaRead(
          request.query.s3Key,
          requesterUserId,
          repository,
          s3Storage
        );
        return reply.code(200).send(signed);
      } catch (error) {
        if (
          error instanceof ListingError &&
          (error.statusCode === 403 || error.statusCode === 404)
        ) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.post(
    '/listings',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: createListingSchema,
        response: {
          201: listingResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const created = await publishListing(
          request.user.sub,
          request.body,
          repository,
          s3Storage
        );
        return reply.code(201).send(created);
      } catch (error) {
        if (
          error instanceof ListingError &&
          (error.statusCode === 400 || error.statusCode === 404)
        ) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.get(
    '/listings',
    {
      schema: {
        querystring: listListingsQuerySchema,
        response: {
          200: listListingsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const items = await listListings(request.query, repository, s3Storage);
      return reply.code(200).send({ items });
    }
  );

  fastify.get(
    '/listings/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid('ID do anúncio inválido.') }),
        response: {
          200: listingResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const requesterUserId = await resolveOptionalUserId(request);

      try {
        const listing = await getListingDetails(
          request.params.id,
          requesterUserId,
          repository,
          s3Storage
        );
        return reply.code(200).send(listing);
      } catch (error) {
        if (
          error instanceof ListingError &&
          (error.statusCode === 403 || error.statusCode === 404)
        ) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.delete(
    '/listings/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid('ID do anúncio inválido.') }),
        response: {
          200: listingResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const cancelled = await cancelListing(
          request.params.id,
          request.user.sub,
          repository,
          s3Storage
        );
        return reply.code(200).send(cancelled);
      } catch (error) {
        if (
          error instanceof ListingError &&
          (error.statusCode === 403 ||
            error.statusCode === 404 ||
            error.statusCode === 409)
        ) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );
};
