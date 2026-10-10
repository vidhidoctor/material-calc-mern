import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import * as settingsService from './settings.service.js';
import type { AddAdminEmailInput } from './settings.validation.js';

export async function get(_req: Request, res: Response): Promise<void> {
  res.json(await settingsService.getSettings());
}

export async function addAdminEmail(req: Request, res: Response): Promise<void> {
  res.status(201).json(await settingsService.addAdminEmail(getAuth(req), req.body as AddAdminEmailInput));
}

export async function removeAdminEmail(req: Request<{ email: string }>, res: Response): Promise<void> {
  res.json(await settingsService.removeAdminEmail(getAuth(req), req.params.email));
}
