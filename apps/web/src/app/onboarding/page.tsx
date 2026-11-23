'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { googleOnboardingSchema, type AuthSessionResponse } from '@pokeshop/shared';
import { apiClient } from '@/lib/api-client';
import {
  clearPendingGoogleOnboarding,
  getPendingGoogleOnboarding,
  saveAuthSession,
  type PendingGoogleOnboarding,
} from '@/features/auth/use-auth';

export default function GoogleOnboardingPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingGoogleOnboarding | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setPending(getPendingGoogleOnboarding());
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) return;

    setFieldErrors({});
    setServerError(null);

    const parsed = googleOnboardingSchema.safeParse({
      onboardingToken: pending.onboardingToken,
      birthDate,
      termsAccepted,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errors[key]) errors[key] = issue.message;
      }

      if (errors.birthDate && birthDate) {
        clearPendingGoogleOnboarding();
      }

      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await apiClient<AuthSessionResponse>('/auth/google/onboarding', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      saveAuthSession(session);
      router.push('/');
    } catch (error: unknown) {
      setServerError(
        error instanceof Error ? error.message : 'Não foi possível concluir o seu cadastro.'
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
            <Link className="back-link" href="/entrar">
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Voltar ao login</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="auth-stage">
        <section className="auth-card" aria-labelledby="onboarding-title">
          <div className="auth-header">
            <h1 id="onboarding-title">Complete seu perfil</h1>
            <p>
              Para ativar sua conta Google no PokeShop, confirme sua data de nascimento e o aceite
              dos Termos de Uso.
            </p>
          </div>

          {pending ? (
            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <div className="auth-profile-badge">
                <strong>{pending.profile.name}</strong>
                <span>{pending.profile.email}</span>
              </div>

              {serverError && (
                <div className="auth-alert" role="alert">
                  {serverError}
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="onboarding-birthdate">Data de nascimento</label>
                <input
                  id="onboarding-birthdate"
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
                <label className="auth-checkbox-row" htmlFor="onboarding-terms">
                  <input
                    id="onboarding-terms"
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
                {isSubmitting ? 'Ativando conta…' : 'Concluir cadastro'}
              </button>
            </form>
          ) : (
            <div className="auth-form">
              <p className="auth-field-hint">
                Nenhuma sessão de autenticação Google pendente foi encontrada.
              </p>
              <Link className="topbar-cta" href="/entrar">
                Ir para a tela de login
              </Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
