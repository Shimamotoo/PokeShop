import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import prismaPlugin from './plugins/prisma.plugin.js';
import authPlugin from './plugins/auth.plugin.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { authRoutes, type AuthRoutesOptions } from './modules/auth/auth.routes.js';
import {
  listingsRoutes,
  type ListingsRoutesOptions,
} from './modules/listings/listings.routes.js';
import {
  ordersRoutes,
  type OrdersRoutesOptions,
} from './modules/orders/orders.routes.js';
import {
  proposalsRoutes,
  type ProposalsRoutesOptions,
} from './modules/proposals/proposals.routes.js';
import { chatRoutes, type ChatRoutesOptions } from './modules/chat/chat.routes.js';

export type BuildAppOptions = {
  auth?: AuthRoutesOptions;
  listings?: ListingsRoutesOptions;
  orders?: OrdersRoutesOptions;
  proposals?: ProposalsRoutesOptions;
  chat?: ChatRoutesOptions;
  logger?: boolean;
};

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, {
    origin: true,
  });

  app.register(prismaPlugin);
  app.register(authPlugin);

  // Rotas de Domínio
  app.register(healthRoutes);
  app.register(catalogRoutes);
  app.register(authRoutes, options.auth ?? {});
  app.register(listingsRoutes, options.listings ?? {});
  app.register(ordersRoutes, options.orders ?? {});
  app.register(proposalsRoutes, options.proposals ?? {});
  app.register(chatRoutes, options.chat ?? {});

  return app;
}
