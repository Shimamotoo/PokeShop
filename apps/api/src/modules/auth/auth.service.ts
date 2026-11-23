import type { AuthUser, LoginInput, RegisterInput } from '@pokeshop/shared';
import { hashPassword, verifyPassword } from './auth.utils.js';
import type { GoogleIdentityProfile, GoogleIdentityProvider } from './google.provider.js';

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 401 | 403 | 409
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export type StoredUserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  birthDate: Date | null;
  termsAcceptedAt: Date | null;
  googleId: string | null;
  role: 'USER' | 'ADMIN' | 'MODERATOR';
  isBanned: boolean;
};

export type CreateUserRecordInput = {
  name: string;
  email: string;
  passwordHash?: string | null;
  birthDate: Date;
  termsAcceptedAt: Date;
  googleId?: string | null;
};

export interface AuthUserRepository {
  findByEmail(email: string): Promise<StoredUserRecord | null>;
  findById(id: string): Promise<StoredUserRecord | null>;
  findByGoogleId(googleId: string): Promise<StoredUserRecord | null>;
  create(data: CreateUserRecordInput): Promise<StoredUserRecord>;
  linkGoogleId(userId: string, googleId: string): Promise<StoredUserRecord>;
}

export function toAuthUser(user: StoredUserRecord): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function registerUser(
  input: RegisterInput,
  repository: AuthUserRepository
): Promise<AuthUser> {

  const normalizedEmail = input.email.trim().toLowerCase();

  const existingUser = await repository.findByEmail(normalizedEmail);
  if (existingUser) {
    throw new AuthError('Este e-mail já está em uso.', 409);
  }

  const passwordHash = await hashPassword(input.password);

  const createdUser = await repository.create({
    name: input.name,
    email: normalizedEmail,
    passwordHash,
    birthDate: new Date(input.birthDate),
    termsAcceptedAt: new Date(),
  });

  return toAuthUser(createdUser);
}

export async function loginUser(
  input: LoginInput,
  repository: AuthUserRepository
): Promise<AuthUser> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await repository.findByEmail(normalizedEmail);

  if (!user || !user.passwordHash) {
    throw new AuthError('E-mail ou senha inválidos.', 401);
  }

  if (user.isBanned) {
    throw new AuthError('Esta conta foi suspensa.', 403);
  }

  const isValidPassword = await verifyPassword(input.password, user.passwordHash);
  if (!isValidPassword) {
    throw new AuthError('E-mail ou senha inválidos.', 401);
  }

  return toAuthUser(user);
}

export type GoogleAuthServiceResult =
  | {
      needsOnboarding: false;
      user: AuthUser;
    }
  | {
      needsOnboarding: true;
      profile: GoogleIdentityProfile;
    };

export async function authenticateWithGoogle(
  idToken: string,
  googleProvider: GoogleIdentityProvider,
  repository: AuthUserRepository
): Promise<GoogleAuthServiceResult> {
  const profile = await googleProvider.verifyIdToken(idToken);
  if (!profile) {
    throw new AuthError('Token do Google inválido ou expirado.', 401);
  }

  const normalizedEmail = profile.email.trim().toLowerCase();
  const existingUser =
    (await repository.findByGoogleId(profile.googleId)) ??
    (await repository.findByEmail(normalizedEmail));

  if (!existingUser) {
    return {
      needsOnboarding: true,
      profile: {
        ...profile,
        email: normalizedEmail,
      },
    };
  }

  if (existingUser.isBanned) {
    throw new AuthError('Esta conta foi suspensa.', 403);
  }

  if (!existingUser.googleId) {
    const linked = await repository.linkGoogleId(existingUser.id, profile.googleId);
    return {
      needsOnboarding: false,
      user: toAuthUser(linked),
    };
  }

  return {
    needsOnboarding: false,
    user: toAuthUser(existingUser),
  };
}

export async function completeGoogleOnboarding(
  profile: GoogleIdentityProfile,
  birthDate: string,
  repository: AuthUserRepository
): Promise<AuthUser> {
  const normalizedEmail = profile.email.trim().toLowerCase();
  const existingUser =
    (await repository.findByGoogleId(profile.googleId)) ??
    (await repository.findByEmail(normalizedEmail));

  if (existingUser) {
    if (existingUser.isBanned) {
      throw new AuthError('Esta conta foi suspensa.', 403);
    }

    if (!existingUser.googleId) {
      const linked = await repository.linkGoogleId(existingUser.id, profile.googleId);
      return toAuthUser(linked);
    }

    return toAuthUser(existingUser);
  }

  const createdUser = await repository.create({
    name: profile.name.trim(),
    email: normalizedEmail,
    passwordHash: null,
    birthDate: new Date(birthDate),
    termsAcceptedAt: new Date(),
    googleId: profile.googleId,
  });

  return toAuthUser(createdUser);
}
