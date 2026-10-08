import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import * as rolesService from './roles.service.js';
import type { CreateRoleInput, SetPermissionsInput } from './roles.validation.js';

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await rolesService.listRoles());
}

export function listPermissions(_req: Request, res: Response): void {
  res.json(rolesService.listPermissions());
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await rolesService.createRole(getAuth(req), req.body as CreateRoleInput));
}

export async function setPermissions(req: Request<{ id: string }>, res: Response): Promise<void> {
  res.json(await rolesService.setRolePermissions(getAuth(req), req.params.id, req.body as SetPermissionsInput));
}
