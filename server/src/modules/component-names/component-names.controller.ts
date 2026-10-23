import type { Request, Response } from 'express';
import * as service from './component-names.service.js';
import type { CreateComponentNameInput } from './component-names.validation.js';

type NameParams = { name: string };

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await service.listComponentNames());
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.addComponentName((req.body as CreateComponentNameInput).name));
}

export async function remove(req: Request<NameParams>, res: Response): Promise<void> {
  res.json(await service.deleteComponentName(req.params.name));
}
