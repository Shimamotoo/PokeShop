'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  loginSchema,
  type AuthSessionResponse,
  type GoogleAuthResponse,
} from '@pokeshop/shared';
import { apiClient } from '@/lib/api-client';
import {
  saveAuthSession,
  savePendingGoogleOnboarding,
} from '@/features/auth/use-auth';
import { GoogleLogo } from '@/features/auth/google-logo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setServerError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await apiClient<AuthSessionResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      saveAuthSession(session);
      router.push('/');
    } catch (error: unknown) {
      setServerError(
        error instanceof Error ? error.message : 'Não foi possível entrar na sua conta.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const googleEmail = email.trim() || 'colecionador@pokeshop.br';
      const googleName = googleEmail.split('@')[0] || 'Colecionador';
      const idToken = `dev_google:${googleEmail}:${googleName}`;

      const result = await apiClient<GoogleAuthResponse>('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      });

      if (result.needsOnboarding) {
        savePendingGoogleOnboarding({
          onboardingToken: result.onboardingToken,
          profile: result.profile,
        });
        router.push('/onboarding');
        return;
      }

      saveAuthSession({ token: result.token, user: result.user });
      router.push('/');
    } catch (error: unknown) {
      setServerError(
        error instanceof Error ? error.message : 'Não foi possível autenticar com o Google.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="detail-shell">
      <header className="store-topbar">
        <div className="store-topbar-inner">
          <Link className="wordmark" href="/" aria-label="PokeShop, início">
            <span className="wordmark-mark" aria-hidden="true">P</span>
            <span>PokeShop</span>
          </Link>
          <div className="topbar-actions">
            <Link className="back-link" href="/">
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Voltar</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="auth-stage">
        <section className="auth-card" aria-labelledby="login-title">
          <div className="auth-header">
            <h1 id="login-title">Entrar na sua conta</h1>
            <p>Acesse o PokeShop para anunciar cartas, enviar propostas e negociar.</p>
          </div>

          <button
            className="google-auth-btn"
            type="button"
            onClick={handleGoogleLogin}
            disabled={isSubmitting}
          >
            <GoogleLogo size={18} />
            <span>Continuar com Google</span>
          </button>

          <div className="auth-divider" aria-hidden="true">
            <span>ou com seu e-mail</span>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {serverError && (
              <div className="auth-alert" role="alert">
                {serverError}
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="login-email">E-mail</label>
              <input
                id="login-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                placeholder="voce@exemplo.com.br"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              {fieldErrors.email && <p className="auth-field-error">{fieldErrors.email}</p>}
            </div>

            <div className="auth-field">
              <label htmlFor="login-password">Senha</label>
              <input
                id="login-password"
                className="auth-input"
                type="password"
                autoComplete="current-password"
                placeholder="Sua senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {fieldErrors.password && (
                <p className="auth-field-error">{fieldErrors.password}</p>
              )}
            </div>

            <button className="auth-submit-btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <p className="auth-footer-switch">
            Ainda não tem conta?{' '}
            <Link className="auth-inline-link" href="/cadastro">
              Criar conta
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
