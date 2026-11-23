import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  catalogCardSchema,
  catalogSearchQuerySchema,
  catalogSearchResponseSchema,
} from '@pokeshop/shared';
import { z } from 'zod';

export const catalogRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/catalog/cards',
    {
      schema: {
        querystring: catalogSearchQuerySchema,
        response: { 200: catalogSearchResponseSchema },
      },
    },
    async ({ query }) => {
      const where = query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { setName: { contains: query.q, mode: 'insensitive' as const } },
              { cardNumber: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {};
      const skip = (query.page - 1) * query.pageSize;

      const [items, total] = await Promise.all([
        fastify.prisma.card.findMany({
          where,
          orderBy: [{ setName: 'asc' }, { cardNumber: 'asc' }, { name: 'asc' }],
          skip,
          take: query.pageSize,
        }),
        fastify.prisma.card.count({ where }),
      ]);

      return {
        items,
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      };
    }
  );

  fastify.get(
    '/catalog/cards/:tcgdexId',
    {
      schema: {
        params: z.object({ tcgdexId: z.string().min(1).max(120) }),
        response: {
          200: catalogCardSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async ({ params }, reply) => {
      const card = await fastify.prisma.card.findUnique({
        where: { tcgdexId: params.tcgdexId },
      });

      if (!card) {
        return reply.code(404).send({ message: 'Carta não encontrada no catálogo.' });
      }

      return card;
    }
  );
};
