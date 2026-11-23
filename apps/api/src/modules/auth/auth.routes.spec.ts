import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import type {
  AuthUserRepository,
  CreateUserRecordInput,
  StoredUserRecord,
} from './auth.service.js';
import type { GoogleIdentityProfile, GoogleIdentityProvider } from './google.provider.js';

function formatBirthDateForAge(yearsOld: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - yearsOld);
  return date.toISOString().slice(0, 10);
}

describe('Rotas HTTP de autenticação (/auth)', () => {
  let app: FastifyInstance;
  let users: StoredUserRecord[];

  const googleTokens: Record<string, GoogleIdentityProfile> = {
    'google-token-novo': {
      googleId: 'google-new-001',
      email: 'novo.google@pokeshop.br',
      name: 'Treinador Novo',
    },
    'google-token-menor': {
      googleId: 'google-minor-002',
      email: 'menor.google@pokeshop.br',
      name: 'Treinador Menor',
    },
  };

  const fakeGoogleProvider: GoogleIdentityProvider = {
    async verifyIdToken(idToken) {
      return googleTokens[idToken] ?? null;
    },
  };

  const inMemoryAuthRepository: AuthUserRepository = {
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
      const created: StoredUserRecord = {
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
      users.push(created);
      return created;
    },
    async linkGoogleId(userId, googleId) {
      const user = users.find((u) => u.id === userId);
      if (!user) throw new Error('User not found');
      user.googleId = googleId;
      return user;
    },
  };

  before(async () => {
    users = [];
    app = buildApp({
      logger: false,
      auth: {
        googleProvider: fakeGoogleProvider,
        authRepository: inMemoryAuthRepository,
      },
    });
    await app.ready();
  });

  beforeEach(() => {
    users.length = 0;
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /auth/register cadastra usuário >= 13 anos com termos aceitos e retorna JWT válido', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Bruno',
        email: 'bruno@pokeshop.br',
        password: 'senha-segura',
        birthDate: formatBirthDateForAge(20),
        termsAccepted: true,
      },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.ok(body.token);
    assert.equal(body.user.email, 'bruno@pokeshop.br');
    assert.equal(users.length, 1);

    const meResponse = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${body.token}`,
      },
    });

    assert.equal(meResponse.statusCode, 200);
    assert.equal(meResponse.json().email, 'bruno@pokeshop.br');
  });

  it('POST /auth/register bloqueia menor de 13 anos e ausência de aceite dos termos', async () => {
    const underageRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Criança',
        email: 'crianca@pokeshop.br',
        password: 'senha-segura',
        birthDate: formatBirthDateForAge(12),
        termsAccepted: true,
      },
    });

    assert.equal(underageRes.statusCode, 400);
    assert.equal(users.length, 0);

    const noTermsRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Adulto Sem Termos',
        email: 'adulto@pokeshop.br',
        password: 'senha-segura',
        birthDate: formatBirthDateForAge(25),
        termsAccepted: false,
      },
    });

    assert.equal(noTermsRes.statusCode, 400);
    assert.equal(users.length, 0);
  });

  it('POST /auth/login autentica conta cadastrada e retorna 401 para credenciais inválidas', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Carla',
        email: 'carla@pokeshop.br',
        password: 'charizard-99',
        birthDate: formatBirthDateForAge(18),
        termsAccepted: true,
      },
    });

    const okRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'carla@pokeshop.br',
        password: 'charizard-99',
      },
    });

    assert.equal(okRes.statusCode, 200);
    assert.ok(okRes.json().token);

    const failRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'carla@pokeshop.br',
        password: 'senha-errada',
      },
    });

    assert.equal(failRes.statusCode, 401);
  });

  it('Fluxo Google: novo usuário exige onboarding, token de onboarding não acessa rota protegida e menor de 13 não é persistido', async () => {
    // 1. Primeiro login com Google -> exige onboarding sem persistir conta
    const googleRes = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: 'google-token-menor' },
    });

    assert.equal(googleRes.statusCode, 200);
    const googleBody = googleRes.json();
    assert.equal(googleBody.needsOnboarding, true);
    assert.ok(googleBody.onboardingToken);
    assert.equal(users.length, 0);

    // 2. Token de onboarding não pode ser usado como sessão autenticada
    const blockedMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${googleBody.onboardingToken}` },
    });
    assert.equal(blockedMe.statusCode, 403);

    // 3. Menor de 13 anos no onboarding -> rejeitado e nenhuma conta ativa persistida
    const underageOnboarding = await app.inject({
      method: 'POST',
      url: '/auth/google/onboarding',
      payload: {
        onboardingToken: googleBody.onboardingToken,
        birthDate: formatBirthDateForAge(11),
        termsAccepted: true,
      },
    });

    assert.equal(underageOnboarding.statusCode, 400);
    assert.equal(users.length, 0);
  });

  it('Fluxo Google: onboarding válido (+13 e termos) ativa conta e próximo login entra em 1 clique', async () => {
    const firstGoogle = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: 'google-token-novo' },
    });

    assert.equal(firstGoogle.statusCode, 200);
    const { onboardingToken } = firstGoogle.json();

    const onboardingRes = await app.inject({
      method: 'POST',
      url: '/auth/google/onboarding',
      payload: {
        onboardingToken,
        birthDate: formatBirthDateForAge(16),
        termsAccepted: true,
      },
    });

    assert.equal(onboardingRes.statusCode, 201);
    const { token, user } = onboardingRes.json();
    assert.ok(token);
    assert.equal(user.email, 'novo.google@pokeshop.br');
    assert.equal(users.length, 1);

    // Login seguinte com Google entra direto sem onboarding
    const returningGoogle = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: 'google-token-novo' },
    });

    assert.equal(returningGoogle.statusCode, 200);
    assert.equal(returningGoogle.json().needsOnboarding, false);
    assert.ok(returningGoogle.json().token);
  });

  it('GET /auth/me retorna 401 para visitantes sem sessão válida', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });

    assert.equal(response.statusCode, 401);
  });
});
