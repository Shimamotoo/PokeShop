const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

export async function apiClient<T>(
  endpoint: string,
  init?: RequestInit
): Promise<T> {
  const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}
