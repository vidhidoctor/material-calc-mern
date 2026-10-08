import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import * as usersService from './users.service.js';
import type { CreateUserInput, UpdateUserInput } from './users.validation.js';

type IdParams = { id: string };

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await usersService.listUsers());
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await usersService.createUser(getAuth(req), req.body as CreateUserInput));
}

export async function update(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await usersService.updateUser(getAuth(req), req.params.id, req.body as UpdateUserInput));
}

export async function remove(req: Request<IdParams>, res: Response): Promise<void> {
  await usersService.deleteUser(getAuth(req), req.params.id);
  res.status(204).end();
}
