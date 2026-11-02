import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import * as service from './design-costing.service.js';
import type { DesignCostingInput } from './design-costing.validation.js';

type DesignParams = { designNo: string };

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listDesignCostings((req.query as { q?: string }).q));
}

export async function get(req: Request<DesignParams>, res: Response): Promise<void> {
  res.json(await service.getDesignCosting(req.params.designNo));
}

export async function preview(req: Request<DesignParams>, res: Response): Promise<void> {
  res.json(await service.previewDesignCosting(req.params.designNo, req.body as DesignCostingInput));
}

export async function save(req: Request<DesignParams>, res: Response): Promise<void> {
  res.json(await service.saveDesignCosting(req.params.designNo, req.body as DesignCostingInput, getAuth(req).user.email));
}
