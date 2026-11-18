import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const healthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal('ok'),
            timestamp: z.string(),
            service: z.string(),
          }),
        },
      },
    },
    async () => {
      return {
        status: 'ok' as const,
        timestamp: new Date().toISOString(),
        service: 'pokeshop-api',
      };
    }
  );
};
