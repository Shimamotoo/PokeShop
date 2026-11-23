'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  registerSchema,
  type AuthSessionResponse,
  type GoogleAuthResponse,
} from '@pokeshop/shared';
import { apiClient } from '@/lib/api-client';
import {
  saveAuthSession,
  savePendingGoogleOnboarding,
} from '@/features/auth/use-auth';
import { GoogleLogo } from '@/features/auth/google-logo';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setServerError(null);

    const parsed = registerSchema.safeParse({
      name,
      email,
      password,
      birthDate,
      termsAccepted,
    });

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
      const session = await apiClient<AuthSessionResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      saveAuthSession(session);
      router.push('/');
    } catch (error: unknown) {
      setServerError(
        error instanceof Error ? error.message : 'Não foi possível criar a sua conta.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignup() {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const googleEmail = email.trim() || 'novo.colecionador@pokeshop.br';
      const googleName = name.trim() || googleEmail.split('@')[0] || 'Colecionador';
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
        error instanceof Error ? error.message : 'Não foi possível continuar com o Google.'
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
              <span>Voltar para a vitrine</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="auth-stage">
        <section className="auth-card" aria-labelledby="register-title">
          <div className="auth-header">
            <h1 id="register-title">Criar sua conta</h1>
            <p>Cadastre-se para anunciar exemplares, enviar propostas e montar sua coleção.</p>
          </div>

          <button
            className="google-auth-btn"
            type="button"
            onClick={handleGoogleSignup}
            disabled={isSubmitting}
          >
            <GoogleLogo size={18} />
            <span>Continuar com Google</span>
          </button>

          <div className="auth-divider" aria-hidden="true">
            <span>ou cadastre com e-mail</span>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {serverError && (
              <div className="auth-alert" role="alert">
                {serverError}
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="register-name">Nome</label>
              <input
                id="register-name"
                className="auth-input"
                type="text"
                autoComplete="name"
                placeholder="Seu nome ou apelido"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              {fieldErrors.name && <p className="auth-field-error">{fieldErrors.name}</p>}
            </div>

            <div className="auth-field">
              <label htmlFor="register-email">E-mail</label>
              <input
                id="register-email"
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
              <label htmlFor="register-password">Senha</label>
              <input
                id="register-password"
                className="auth-input"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo de 6 caracteres"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {fieldErrors.password && (
                <p className="auth-field-error">{fieldErrors.password}</p>
              )}
            </div>

            <div className="auth-field">
              <label htmlFor="register-birthdate">Data de nascimento</label>
              <input
                id="register-birthdate"
                className="auth-input"
                type="date"
                autoComplete="bday"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
              <p className="auth-field-hint">Cadastro disponível para maiores de 13 anos.</p>
              {fieldErrors.birthDate && (
                <p className="auth-field-error">{fieldErrors.birthDate}</p>
              )}
            </div>

            <div className="auth-field">
              <label className="auth-checkbox-row" htmlFor="register-terms">
                <input
                  id="register-terms"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                />
                <span>
                  Li e aceito os{' '}
                  <Link className="auth-inline-link" href="/termos">
                    Termos de Uso
                  </Link>{' '}
                  do PokeShop.
                </span>
              </label>
              {fieldErrors.termsAccepted && (
                <p className="auth-field-error">{fieldErrors.termsAccepted}</p>
              )}
            </div>

            <button className="auth-submit-btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Criando conta…' : 'Criar conta'}
            </button>
          </form>

          <p className="auth-footer-switch">
            Já possui uma conta?{' '}
            <Link className="auth-inline-link" href="/entrar">
              Entrar
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
