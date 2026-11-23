import { z } from 'zod';

const minimumAgeRefine = (val: string) => {
  const date = new Date(val);
  if (isNaN(date.getTime())) return false;
  const now = new Date();
  const age = now.getFullYear() - date.getFullYear();
  const m = now.getMonth() - date.getMonth();
  const finalAge = m < 0 || (m === 0 && now.getDate() < date.getDate()) ? age - 1 : age;
  return finalAge >= 13;
};

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
  birthDate: z
    .string()
    .refine(minimumAgeRefine, 'Você deve ter pelo menos 13 anos para criar uma conta.'),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Você precisa aceitar os Termos de Uso.' }),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Token de identificação do Google é obrigatório'),
});

export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const googleOnboardingSchema = z.object({
  onboardingToken: z.string().min(1, 'Token de onboarding é obrigatório'),
  birthDate: z
    .string()
    .refine(minimumAgeRefine, 'Você deve ter pelo menos 13 anos para utilizar o PokeShop.'),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Você precisa aceitar os Termos de Uso.' }),
  }),
});

export type GoogleOnboardingInput = z.infer<typeof googleOnboardingSchema>;

export const authUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['USER', 'ADMIN', 'MODERATOR']),
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const authSessionResponseSchema = z.object({
  token: z.string(),
  user: authUserSchema,
});

export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const googleAuthResponseSchema = z.discriminatedUnion('needsOnboarding', [
  z.object({
    needsOnboarding: z.literal(false),
    token: z.string(),
    user: authUserSchema,
  }),
  z.object({
    needsOnboarding: z.literal(true),
    onboardingToken: z.string(),
    profile: z.object({
      email: z.string().email(),
      name: z.string(),
    }),
  }),
]);

export type GoogleAuthResponse = z.infer<typeof googleAuthResponseSchema>;
