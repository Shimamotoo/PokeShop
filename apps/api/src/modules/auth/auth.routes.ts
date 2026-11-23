import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  authSessionResponseSchema,
  authUserSchema,
  googleAuthResponseSchema,
  googleAuthSchema,
  googleOnboardingSchema,
  loginSchema,
  registerSchema,
  type AuthUser,
} from '@pokeshop/shared';
import { z } from 'zod';
import type { AppJwtPayload, GoogleOnboardingJwtPayload } from '../../plugins/auth.plugin.js';
import { createPrismaAuthRepository } from './auth.repository.js';
import {
  AuthError,
  authenticateWithGoogle,
  completeGoogleOnboarding,
  loginUser,
  registerUser,
  toAuthUser,
  type AuthUserRepository,
} from './auth.service.js';
import {
  createGoogleIdentityProvider,
  type GoogleIdentityProvider,
} from './google.provider.js';

export type AuthRoutesOptions = {
  googleProvider?: GoogleIdentityProvider;
  authRepository?: AuthUserRepository;
};

const errorResponseSchema = z.object({
  message: z.string(),
});

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (fastify, options) => {
  const repository = options.authRepository ?? createPrismaAuthRepository(fastify.prisma);
  const googleProvider = options.googleProvider ?? createGoogleIdentityProvider();

  function signSessionToken(user: AuthUser): string {
    return fastify.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        purpose: 'session',
      },
      { expiresIn: '7d' }
    );
  }

  fastify.post(
    '/auth/register',
    {
      schema: {
        body: registerSchema,
        response: {
          201: authSessionResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await registerUser(request.body, repository);
        const token = signSessionToken(user);
        return reply.code(201).send({ token, user });
      } catch (error) {
        if (error instanceof AuthError && error.statusCode === 409) {
          return reply.code(409).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.post(
    '/auth/login',
    {
      schema: {
        body: loginSchema,
        response: {
          200: authSessionResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await loginUser(request.body, repository);
        const token = signSessionToken(user);
        return reply.code(200).send({ token, user });
      } catch (error) {
        if (error instanceof AuthError && (error.statusCode === 401 || error.statusCode === 403)) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.post(
    '/auth/google',
    {
      schema: {
        body: googleAuthSchema,
        response: {
          200: googleAuthResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await authenticateWithGoogle(
          request.body.idToken,
          googleProvider,
          repository
        );

        if (result.needsOnboarding) {
          const onboardingToken = fastify.jwt.sign(
            {
              sub: result.profile.googleId,
              email: result.profile.email,
              name: result.profile.name,
              purpose: 'google_onboarding',
            },
            { expiresIn: '15m' }
          );

          return reply.code(200).send({
            needsOnboarding: true,
            onboardingToken,
            profile: {
              email: result.profile.email,
              name: result.profile.name,
            },
          });
        }

        const token = signSessionToken(result.user);
        return reply.code(200).send({
          needsOnboarding: false,
          token,
          user: result.user,
        });
      } catch (error) {
        if (error instanceof AuthError && (error.statusCode === 401 || error.statusCode === 403)) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.post(
    '/auth/google/onboarding',
    {
      schema: {
        body: googleOnboardingSchema,
        response: {
          201: authSessionResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      let payload: AppJwtPayload;
      try {
        payload = fastify.jwt.verify<AppJwtPayload>(request.body.onboardingToken);
      } catch {
        return reply.code(401).send({
          message: 'Sessão de onboarding inválida ou expirada. Tente entrar com o Google novamente.',
        });
      }

      if (payload.purpose !== 'google_onboarding') {
        return reply.code(401).send({
          message: 'Token inválido para conclusão de onboarding.',
        });
      }

      const onboardingPayload: GoogleOnboardingJwtPayload = payload;

      try {
        const user = await completeGoogleOnboarding(
          {
            googleId: onboardingPayload.sub,
            email: onboardingPayload.email,
            name: onboardingPayload.name,
          },
          request.body.birthDate,
          repository
        );

        const token = signSessionToken(user);
        return reply.code(201).send({ token, user });
      } catch (error) {
        if (error instanceof AuthError && (error.statusCode === 401 || error.statusCode === 403)) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  fastify.get(
    '/auth/me',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: {
          200: authUserSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await repository.findById(request.user.sub);
      if (!user) {
        return reply.code(401).send({ message: 'Sessão inválida.' });
      }
      if (user.isBanned) {
        return reply.code(403).send({ message: 'Esta conta foi suspensa.' });
      }

      return reply.code(200).send(toAuthUser(user));
    }
  );
};
