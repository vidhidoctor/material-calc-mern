import { z } from 'zod';
import { email, password, requiredName } from '../../lib/zod.js';

export const signupBody = z.object({
  name: requiredName('Name'),
  email,
  password,
});

export const loginBody = z.object({
  email,
  password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.'),
});

export const forgotPasswordBody = z.object({ email });

export const resetPasswordBody = z.object({
  token: z.string({ error: 'Reset token is required.' }).trim().min(1, 'Reset token is required.'),
  password,
});

export type SignupInput = z.infer<typeof signupBody>;
export type LoginInput = z.infer<typeof loginBody>;
export type ResetPasswordInput = z.infer<typeof resetPasswordBody>;
