import type { Request, Response } from 'express';
import * as productionService from './production.service.js';

export async function listDesigns(req: Request, res: Response): Promise<void> {
  res.json(await productionService.listProductionDesigns((req.query as { q?: string }).q));
}

export async function getDesign(req: Request<{ designNo: string }>, res: Response): Promise<void> {
  res.json(await productionService.getProductionDesign(req.params.designNo));
}
