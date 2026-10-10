import type { Request, Response } from 'express';
import * as categoriesService from './material-categories.service.js';
import type { CreateCategoryInput, UpdateCategoryInput } from './material-categories.validation.js';

type CodeParams = { code: string };

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await categoriesService.listCategories());
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await categoriesService.createCategory(req.body as CreateCategoryInput));
}

export async function update(req: Request<CodeParams>, res: Response): Promise<void> {
  res.json(await categoriesService.updateCategory(req.params.code, req.body as UpdateCategoryInput));
}

export async function remove(req: Request<CodeParams>, res: Response): Promise<void> {
  await categoriesService.deleteCategory(req.params.code);
  res.status(204).end();
}
