import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createOrderSchema,
  listOrdersQuerySchema,
  listOrdersResponseSchema,
  orderResponseSchema,
} from '@pokeshop/shared';
import { z } from 'zod';
import {
  createPrismaOrdersRepository,
  type Clock,
  type OrdersRepository,
} from './orders.repository.js';
import {
  confirmFixedPriceReservation,
  declineFixedPriceReservation,
  getOrderDetails,
  listUserOrders,
  OrderError,
  reserveFixedPriceListing,
} from './orders.service.js';

export type OrdersRoutesOptions = {
  ordersRepository?: OrdersRepository;
  clock?: Clock;
};

const errorResponseSchema = z.object({
  message: z.string(),
});

const orderIdParamsSchema = z.object({
  id: z.string().uuid('ID do pedido inválido.'),
});

export const ordersRoutes: FastifyPluginAsyncZod<OrdersRoutesOptions> = async (
  fastify,
  options
) => {
  const repository =
    options.ordersRepository ?? createPrismaOrdersRepository(fastify.prisma);
  const clock: Clock = options.clock ?? (() => new Date());

  fastify.post(
    '/orders',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: createOrderSchema,
        response: {
          201: orderResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const created = await reserveFixedPriceListing(
          request.body.listingId,
          request.user.sub,
          repository,
          clock
        );
        return reply.code(201).send(created);
      } catch (error) {
        if (
          error instanceof OrderError &&
          (error.statusCode === 400 ||
            error.statusCode === 403 ||
            error.statusCode === 404 ||
            error.statusCode === 409)
        ) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.get(
    '/orders',
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: listOrdersQuerySchema,
        response: {
          200: listOrdersResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const items = await listUserOrders(request.user.sub, request.query, repository);
      return reply.code(200).send({ items });
    }
  );

  fastify.get(
    '/orders/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: orderIdParamsSchema,
        response: {
          200: orderResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const order = await getOrderDetails(
          request.params.id,
          request.user.sub,
          repository
        );
        return reply.code(200).send(order);
      } catch (error) {
        if (
          error instanceof OrderError &&
          (error.statusCode === 403 || error.statusCode === 404)
        ) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.post(
    '/orders/:id/confirm',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: orderIdParamsSchema,
        response: {
          200: orderResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const confirmed = await confirmFixedPriceReservation(
          request.params.id,
          request.user.sub,
          repository,
          clock
        );
        return reply.code(200).send(confirmed);
      } catch (error) {
        if (
          error instanceof OrderError &&
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

  fastify.post(
    '/orders/:id/decline',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: orderIdParamsSchema,
        response: {
          200: orderResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const declined = await declineFixedPriceReservation(
          request.params.id,
          request.user.sub,
          repository,
          clock
        );
        return reply.code(200).send(declined);
      } catch (error) {
        if (
          error instanceof OrderError &&
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
