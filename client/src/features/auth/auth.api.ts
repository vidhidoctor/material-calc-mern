import type { ForgotPasswordResponse, MessageResponse } from '@app/shared';
import { api } from '../../api/client';

export const signup = (body: { name: string; email: string; password: string }) =>
  api<MessageResponse>('/auth/signup', { method: 'POST', body });

export const forgotPassword = (email: string) =>
  api<ForgotPasswordResponse>('/auth/forgot-password', { method: 'POST', body: { email } });

export const resetPassword = (token: string, password: string) =>
  api<MessageResponse>('/auth/reset-password', { method: 'POST', body: { token, password } });
