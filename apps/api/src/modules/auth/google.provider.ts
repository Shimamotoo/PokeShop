export type GoogleIdentityProfile = {
  googleId: string;
  email: string;
  name: string;
};

export interface GoogleIdentityProvider {
  verifyIdToken(idToken: string): Promise<GoogleIdentityProfile | null>;
}

export function createGoogleIdentityProvider(): GoogleIdentityProvider {
  return {
    async verifyIdToken(idToken: string): Promise<GoogleIdentityProfile | null> {
      if (process.env.NODE_ENV !== 'production' && idToken.startsWith('dev_google:')) {
        const [, rawEmail, rawName] = idToken.split(':');
        const email = rawEmail?.trim().toLowerCase();
        const name = rawName?.trim() || email?.split('@')[0];
        if (!email || !name) return null;
        return {
          googleId: `google-dev-${email}`,
          email,
          name,
        };
      }

      try {
        const response = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
        );

        if (!response.ok) return null;

        const payload = (await response.json()) as Record<string, unknown>;
        const googleId = typeof payload.sub === 'string' ? payload.sub : null;
        const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
        const name =
          typeof payload.name === 'string' && payload.name.trim()
            ? payload.name.trim()
            : email?.split('@')[0] ?? null;

        if (!googleId || !email || !name) return null;

        return { googleId, email, name };
      } catch {
        return null;
      }
    },
  };
}
