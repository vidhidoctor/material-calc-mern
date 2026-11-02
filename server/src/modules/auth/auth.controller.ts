import type { Request, Response } from 'express';
import { AppError } from '../../lib/app-error.js';
import { getAuth } from '../../middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';
import * as authService from './auth.service.js';
import type { LoginInput, ResetPasswordInput, SignupInput } from './auth.validation.js';

/** Someone identified only by the email they typed (not logged in). */
const byEmail = (email: string, name = '') => ({ id: null, name, email, role: null });

export async function signup(req: Request, res: Response): Promise<void> {
  const input = req.body as SignupInput;
  const result = await authService.signup(input);
  await recordAudit({ req, actor: byEmail(input.email, input.name), action: 'SIGNUP', module: 'Auth' });
  res.status(201).json(result);
}

/** Logins and failed logins are both recorded (security monitoring). */
export async function login(req: Request, res: Response): Promise<void> {
  const input = req.body as LoginInput;
  try {
    const result = await authService.login(input);
    const { id, name, email, role } = result.user;
    await recordAudit({ req, actor: { id, name, email, role: role?.name ?? null }, action: 'LOGIN', module: 'Auth' });
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      await recordAudit({ req, actor: byEmail(input.email), action: 'LOGIN_FAILED', module: 'Auth', detail: error.message });
    }
    throw error;
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  await recordAudit({ req, action: 'LOGOUT', module: 'Auth' });
  await authService.logout(getAuth(req).tokenHash);
  res.status(204).end();
}

export async function me(req: Request, res: Response): Promise<void> {
  const { user, role } = getAuth(req);
  res.json(await authService.toAuthUser(user, role));
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email: string };
  const result = await authService.forgotPassword(email);
  await recordAudit({ req, actor: byEmail(email), action: 'PASSWORD_RESET_REQUESTED', module: 'Auth' });
  res.json(result);
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const result = await authService.resetPassword(req.body as ResetPasswordInput);
  await recordAudit({ req, actor: null, action: 'PASSWORD_RESET', module: 'Auth', detail: 'Password set with a reset link.' });
  res.json(result);
}
