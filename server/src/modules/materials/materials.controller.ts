import type { Request, Response } from 'express';
import * as materialsService from './materials.service.js';
import type { CreateMaterialInput, UpdateMaterialInput } from './materials.validation.js';

type CodeParams = { code: string };

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await materialsService.listMaterials());
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await materialsService.createMaterial(req.body as CreateMaterialInput));
}

export async function update(req: Request<CodeParams>, res: Response): Promise<void> {
  res.json(await materialsService.updateMaterial(req.params.code, req.body as UpdateMaterialInput));
}

export async function remove(req: Request<CodeParams>, res: Response): Promise<void> {
  await materialsService.deleteMaterial(req.params.code);
  res.status(204).end();
}
