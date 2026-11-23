import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

export type SessionJwtPayload = {
  sub: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'MODERATOR';
  purpose: 'session';
};

export type GoogleOnboardingJwtPayload = {
  sub: string;
  email: string;
  name: string;
  purpose: 'google_onboarding';
};

export type AppJwtPayload = SessionJwtPayload | GoogleOnboardingJwtPayload;

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AppJwtPayload;
    user: AppJwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? 'pokeshop-dev-jwt-secret-key',
  });

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        const payload = await request.jwtVerify<AppJwtPayload>();

        if (payload.purpose !== 'session') {
          return reply.code(403).send({
            message: 'Onboarding pendente. Conclua seu cadastro para realizar esta ação.',
          });
        }
      } catch {
        return reply.code(401).send({
          message: 'Autenticação necessária para realizar esta ação.',
        });
      }
    }
  );
};

export default fp(authPlugin, {
  name: 'auth',
});
