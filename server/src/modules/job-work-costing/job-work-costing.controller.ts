import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import * as service from './job-work-costing.service.js';
import type { JobWorkCostingInput } from './job-work-costing.validation.js';

type DesignParams = { designNo: string };

export async function get(req: Request<DesignParams>, res: Response): Promise<void> {
  res.json(await service.getJobWorkCosting(req.params.designNo));
}

export async function preview(req: Request<DesignParams>, res: Response): Promise<void> {
  res.json(await service.previewJobWorkCosting(req.params.designNo, req.body as JobWorkCostingInput));
}

export async function save(req: Request<DesignParams>, res: Response): Promise<void> {
  res.json(await service.saveJobWorkCosting(req.params.designNo, req.body as JobWorkCostingInput, getAuth(req).user.email));
}
