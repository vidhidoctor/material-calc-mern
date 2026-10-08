import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import * as authService from './auth.service.js';
import type { LoginInput, ResetPasswordInput, SignupInput } from './auth.validation.js';

export async function signup(req: Request, res: Response): Promise<void> {
  res.status(201).json(await authService.signup(req.body as SignupInput));
}

export async function login(req: Request, res: Response): Promise<void> {
  res.json(await authService.login(req.body as LoginInput));
}

export async function logout(req: Request, res: Response): Promise<void> {
  await authService.logout(getAuth(req).tokenHash);
  res.status(204).end();
}

export async function me(req: Request, res: Response): Promise<void> {
  const { user, role } = getAuth(req);
  res.json(await authService.toAuthUser(user, role));
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  res.json(await authService.forgotPassword((req.body as { email: string }).email));
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  res.json(await authService.resetPassword(req.body as ResetPasswordInput));
}
