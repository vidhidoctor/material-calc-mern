import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import * as costingService from './costing.service.js';
import type { SetRateInput } from './costing.validation.js';

export async function listRates(_req: Request, res: Response): Promise<void> {
  res.json(await costingService.listRates());
}

export async function setRate(req: Request<{ key: string }>, res: Response): Promise<void> {
  res.json(await costingService.setRate(req.params.key, req.body as SetRateInput, getAuth(req).user.email));
}

export async function deleteRate(req: Request<{ key: string }>, res: Response): Promise<void> {
  res.json(await costingService.deleteRate(req.params.key));
}

export async function designCost(req: Request<{ designNo: string }>, res: Response): Promise<void> {
  res.json(await costingService.designCost(req.params.designNo));
}

export async function orderCost(req: Request, res: Response): Promise<void> {
  res.json(await costingService.orderCost((req.params as unknown as { orderNo: number }).orderNo));
}

export async function listTypeRates(_req: Request, res: Response): Promise<void> {
  res.json(await costingService.listTypeRates());
}

export async function setTypeRate(req: Request<{ category: string; type: string }>, res: Response): Promise<void> {
  res.json(await costingService.setTypeRate(req.params.category, req.params.type, req.body as SetRateInput, getAuth(req).user.email));
}
