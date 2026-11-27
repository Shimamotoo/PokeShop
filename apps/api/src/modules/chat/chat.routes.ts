import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  chatIndicatorsResponseSchema,
  chatMessageSchema,
  listChatMessagesQuerySchema,
  listChatMessagesResponseSchema,
  markChatReadResponseSchema,
  sendChatMessageSchema,
} from '@pokeshop/shared';
import { z } from 'zod';
import {
  createPrismaChatRepository,
  type ChatRepository,
  type Clock,
} from './chat.repository.js';
import {
  ChatError,
  getChatIndicators,
  listChatMessages,
  markAllNotificationsAsRead,
  markChatRoomAsRead,
  markNotificationAsRead,
  sendChatMessage,
} from './chat.service.js';

export type ChatRoutesOptions = {
  chatRepository?: ChatRepository;
  clock?: Clock;
};

const errorResponseSchema = z.object({
  message: z.string(),
});

const orderChatParamsSchema = z.object({
  orderId: z.string().uuid('ID da negociação inválido.'),
});

const alertIdParamsSchema = z.object({
  alertId: z.string().uuid('ID do alerta inválido.'),
});

const markAlertReadResponseSchema = z.object({
  id: z.string().uuid(),
  readAt: z.string(),
});

const markAllAlertsReadResponseSchema = z.object({
  updatedCount: z.number().int().nonnegative(),
});

export const chatRoutes: FastifyPluginAsyncZod<ChatRoutesOptions> = async (
  fastify,
  options
) => {
  const repository =
    options.chatRepository ?? createPrismaChatRepository(fastify.prisma);
  const clock: Clock = options.clock ?? (() => new Date());

  fastify.get(
    '/orders/:orderId/chat/messages',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: orderChatParamsSchema,
        querystring: listChatMessagesQuerySchema,
        response: {
          200: listChatMessagesResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await listChatMessages(
          request.params.orderId,
          request.user.sub,
          request.query,
          repository
        );
        return reply.code(200).send(result);
      } catch (error) {
        if (
          error instanceof ChatError &&
          (error.statusCode === 403 || error.statusCode === 404)
        ) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.post(
    '/orders/:orderId/chat/messages',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: orderChatParamsSchema,
        body: sendChatMessageSchema,
        response: {
          201: chatMessageSchema,
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
        const message = await sendChatMessage(
          request.params.orderId,
          request.user.sub,
          request.body,
          repository,
          clock
        );
        return reply.code(201).send(message);
      } catch (error) {
        if (
          error instanceof ChatError &&
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

  fastify.post(
    '/orders/:orderId/chat/read',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: orderChatParamsSchema,
        response: {
          200: markChatReadResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await markChatRoomAsRead(
          request.params.orderId,
          request.user.sub,
          repository,
          clock
        );
        return reply.code(200).send(result);
      } catch (error) {
        if (
          error instanceof ChatError &&
          (error.statusCode === 403 || error.statusCode === 404)
        ) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.get(
    '/chat/indicators',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: {
          200: chatIndicatorsResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const indicators = await getChatIndicators(request.user.sub, repository);
      return reply.code(200).send(indicators);
    }
  );

  fastify.post(
    '/chat/indicators/alerts/:alertId/read',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: alertIdParamsSchema,
        response: {
          200: markAlertReadResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await markNotificationAsRead(
          request.params.alertId,
          request.user.sub,
          repository,
          clock
        );
        return reply.code(200).send(result);
      } catch (error) {
        if (error instanceof ChatError && error.statusCode === 404) {
          return reply.code(404).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.post(
    '/chat/indicators/alerts/read-all',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: {
          200: markAllAlertsReadResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await markAllNotificationsAsRead(
        request.user.sub,
        repository,
        clock
      );
      return reply.code(200).send(result);
    }
  );
};
