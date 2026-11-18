import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
  birthDate: z.string().refine((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    const age = now.getFullYear() - date.getFullYear();
    const m = now.getMonth() - date.getMonth();
    const finalAge = m < 0 || (m === 0 && now.getDate() < date.getDate()) ? age - 1 : age;
    return finalAge >= 13;
  }, 'Você deve ter pelo menos 13 anos para criar uma conta.'),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Você precisa aceitar os Termos de Uso.' }),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const googleOnboardingSchema = z.object({
  birthDate: z.string().refine((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    const age = now.getFullYear() - date.getFullYear();
    const m = now.getMonth() - date.getMonth();
    const finalAge = m < 0 || (m === 0 && now.getDate() < date.getDate()) ? age - 1 : age;
    return finalAge >= 13;
  }, 'Você deve ter pelo menos 13 anos para utilizar o PokeShop.'),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Você precisa aceitar os Termos de Uso.' }),
  }),
});

export type GoogleOnboardingInput = z.infer<typeof googleOnboardingSchema>;
