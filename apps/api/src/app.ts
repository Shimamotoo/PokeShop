import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import prismaPlugin from './plugins/prisma.plugin.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';

export function buildApp() {
  const app = Fastify({
    logger: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, {
    origin: true,
  });

  app.register(prismaPlugin);

  // Rotas de Domínio
  app.register(healthRoutes);
  app.register(catalogRoutes);

  return app;
}