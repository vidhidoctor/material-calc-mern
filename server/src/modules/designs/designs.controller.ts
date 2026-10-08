import type { Request, Response } from 'express';
import * as designsService from './designs.service.js';
import type { CreateDesignInput, PutComponentInput } from './designs.validation.js';

type DesignParams = { designNo: string };
type ComponentParams = { designNo: string; name: string };

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await designsService.listDesigns((req.query as { q?: string }).q));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await designsService.createDesign(req.body as CreateDesignInput));
}

export async function get(req: Request<DesignParams>, res: Response): Promise<void> {
  res.json(await designsService.getDesignDetail(req.params.designNo));
}

export async function update(req: Request<DesignParams>, res: Response): Promise<void> {
  res.json(await designsService.updateProductName(req.params.designNo, (req.body as { productName: string }).productName));
}

export async function putComponent(req: Request<ComponentParams>, res: Response): Promise<void> {
  res.json(await designsService.putComponent(req.params.designNo, req.params.name, req.body as PutComponentInput));
}

export async function removeComponent(req: Request<ComponentParams>, res: Response): Promise<void> {
  res.json(await designsService.deleteComponent(req.params.designNo, req.params.name));
}
