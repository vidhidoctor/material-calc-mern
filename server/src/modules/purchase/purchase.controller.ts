import type { Request, Response } from 'express';
import * as purchaseService from './purchase.service.js';
import type { PurchaseQuery } from './purchase.validation.js';

export async function requirements(req: Request, res: Response): Promise<void> {
  res.json(await purchaseService.getPurchaseRequirements(req.query as unknown as PurchaseQuery));
}
