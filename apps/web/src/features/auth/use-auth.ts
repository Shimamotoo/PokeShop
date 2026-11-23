'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AuthSessionResponse, AuthUser } from '@pokeshop/shared';
import { apiClient, AUTH_TOKEN_STORAGE_KEY } from '@/lib/api-client';

const AUTH_USER_STORAGE_KEY = 'pokeshop.auth.user';
const PENDING_ONBOARDING_KEY = 'pokeshop.auth.onboarding';

export type PendingGoogleOnboarding = {
  onboardingToken: string;
  profile: {
    email: string;
    name: string;
  };
};

export function saveAuthSession(session: AuthSessionResponse): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, session.token);
  window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(session.user));
  window.sessionStorage.removeItem(PENDING_ONBOARDING_KEY);
}

export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
}

export function savePendingGoogleOnboarding(data: PendingGoogleOnboarding): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PENDING_ONBOARDING_KEY, JSON.stringify(data));
}

export function getPendingGoogleOnboarding(): PendingGoogleOnboarding | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(PENDING_ONBOARDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingGoogleOnboarding;
  } catch {
    return null;
  }
}

export function clearPendingGoogleOnboarding(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PENDING_ONBOARDING_KEY);
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    const cachedUser = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (cachedUser) {
      try {
        setUser(JSON.parse(cachedUser) as AuthUser);
      } catch {
        // segue para validação via /auth/me
      }
    }

    const controller = new AbortController();
    apiClient<AuthUser>('/auth/me', { signal: controller.signal })
      .then((freshUser) => {
        setUser(freshUser);
        window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(freshUser));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          clearAuthSession();
          setUser(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  const logout = useCallback(() => {
    clearAuthSession();
    setUser(null);
  }, []);

  return {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    logout,
  };
}
