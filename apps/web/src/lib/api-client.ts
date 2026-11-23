const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
export const AUTH_TOKEN_STORAGE_KEY = 'pokeshop.auth.token';

export async function apiClient<T>(
  endpoint: string,
  init?: RequestInit
): Promise<T> {
  const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const storedToken =
    typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;

  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (storedToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${storedToken}`);
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}
