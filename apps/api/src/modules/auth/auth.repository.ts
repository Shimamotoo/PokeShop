import type { PrismaClient } from '@pokeshop/database';
import { AuthError, type AuthUserRepository, type CreateUserRecordInput } from './auth.service.js';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export function createPrismaAuthRepository(prisma: PrismaClient): AuthUserRepository {
  return {
    async findByEmail(email: string) {
      return prisma.user.findUnique({ where: { email } });
    },

    async findById(id: string) {
      return prisma.user.findUnique({ where: { id } });
    },

    async findByGoogleId(googleId: string) {
      return prisma.user.findUnique({ where: { googleId } });
    },

    async create(data: CreateUserRecordInput) {
      try {
        return await prisma.user.create({
          data: {
            name: data.name,
            email: data.email,
            passwordHash: data.passwordHash ?? null,
            birthDate: data.birthDate,
            termsAcceptedAt: data.termsAcceptedAt,
            googleId: data.googleId ?? null,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new AuthError('Este e-mail já está em uso.', 409);
        }
        throw error;
      }
    },

    async linkGoogleId(userId: string, googleId: string) {
      return prisma.user.update({
        where: { id: userId },
        data: { googleId },
      });
    },
  };
}
