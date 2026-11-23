import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  AuthError,
  authenticateWithGoogle,
  completeGoogleOnboarding,
  loginUser,
  registerUser,
  type AuthUserRepository,
  type CreateUserRecordInput,
  type StoredUserRecord,
} from './auth.service.js';
import type { GoogleIdentityProfile, GoogleIdentityProvider } from './google.provider.js';

function createInMemoryAuthRepository(): AuthUserRepository & { users: StoredUserRecord[] } {
  const users: StoredUserRecord[] = [];

  return {
    users,
    async findByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },
    async findById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
    async findByGoogleId(googleId) {
      return users.find((u) => u.googleId === googleId) ?? null;
    },
    async create(data: CreateUserRecordInput) {
      const record: StoredUserRecord = {
        id: randomUUID(),
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash ?? null,
        birthDate: data.birthDate,
        termsAcceptedAt: data.termsAcceptedAt,
        googleId: data.googleId ?? null,
        role: 'USER',
        isBanned: false,
      };
      users.push(record);
      return record;
    },
    async linkGoogleId(userId, googleId) {
      const user = users.find((u) => u.id === userId);
      if (!user) throw new Error('User not found');
      user.googleId = googleId;
      return user;
    },
  };
}

describe('auth.service', () => {
  it('registerUser cria conta normalizando e-mail, aplicando hash na senha e salvando termos', async () => {
    const repo = createInMemoryAuthRepository();

    const user = await registerUser(
      {
        name: 'Ash Ketchum',
        email: '  ASH@Pallet.com  ',
        password: 'pikachu123',
        birthDate: '2000-05-22',
        termsAccepted: true,
      },
      repo
    );

    assert.equal(user.email, 'ash@pallet.com');
    assert.equal(user.name, 'Ash Ketchum');
    assert.equal(user.role, 'USER');
    assert.equal(repo.users.length, 1);
    assert.ok(repo.users[0].passwordHash);
    assert.notEqual(repo.users[0].passwordHash, 'pikachu123');
    assert.ok(repo.users[0].termsAcceptedAt instanceof Date);
  });

  it('registerUser recusa e-mail duplicado com AuthError 409', async () => {
    const repo = createInMemoryAuthRepository();
    const input = {
      name: 'Misty',
      email: 'misty@cerulean.com',
      password: 'starmie123',
      birthDate: '2001-03-10',
      termsAccepted: true as const,
    };

    await registerUser(input, repo);

    await assert.rejects(
      () => registerUser({ ...input, email: 'MISTY@cerulean.com' }, repo),
      (err: unknown) => err instanceof AuthError && err.statusCode === 409
    );
  });

  it('loginUser autentica com senha válida e rejeita senha incorreta ou conta somente Google', async () => {
    const repo = createInMemoryAuthRepository();

    await registerUser(
      {
        name: 'Brock',
        email: 'brock@pewter.com',
        password: 'onix-secret',
        birthDate: '1999-08-15',
        termsAccepted: true,
      },
      repo
    );

    const logged = await loginUser(
      { email: 'BROCK@pewter.com', password: 'onix-secret' },
      repo
    );
    assert.equal(logged.email, 'brock@pewter.com');

    await assert.rejects(
      () => loginUser({ email: 'brock@pewter.com', password: 'wrong' }, repo),
      (err: unknown) => err instanceof AuthError && err.statusCode === 401
    );

    await completeGoogleOnboarding(
      { googleId: 'g-1', email: 'gary@pallet.com', name: 'Gary Oak' },
      '2000-01-01',
      repo
    );

    await assert.rejects(
      () => loginUser({ email: 'gary@pallet.com', password: 'any-password' }, repo),
      (err: unknown) => err instanceof AuthError && err.statusCode === 401
    );
  });

  it('authenticateWithGoogle exige onboarding para novos usuários e entra direto após concluído', async () => {
    const repo = createInMemoryAuthRepository();
    const profiles: Record<string, GoogleIdentityProfile> = {
      'valid-google-token': {
        googleId: 'google-sub-42',
        email: 'red@kanto.com',
        name: 'Red',
      },
    };
    const fakeProvider: GoogleIdentityProvider = {
      async verifyIdToken(token) {
        return profiles[token] ?? null;
      },
    };

    const firstAttempt = await authenticateWithGoogle('valid-google-token', fakeProvider, repo);
    assert.equal(firstAttempt.needsOnboarding, true);
    assert.equal(repo.users.length, 0);

    if (firstAttempt.needsOnboarding) {
      await completeGoogleOnboarding(firstAttempt.profile, '2002-10-10', repo);
    }

    assert.equal(repo.users.length, 1);

    const secondAttempt = await authenticateWithGoogle('valid-google-token', fakeProvider, repo);
    assert.equal(secondAttempt.needsOnboarding, false);
    if (!secondAttempt.needsOnboarding) {
      assert.equal(secondAttempt.user.email, 'red@kanto.com');
    }
  });
});
