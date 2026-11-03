import type { PrintSheet } from '@app/shared';
import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import * as service from './print-config.service.js';
import type { PrintConfigInput } from './print-config.validation.js';

type SheetParams = { sheet: PrintSheet };

export async function get(req: Request<SheetParams>, res: Response): Promise<void> {
  res.json(await service.getPrintConfig(req.params.sheet));
}

export async function save(req: Request<SheetParams>, res: Response): Promise<void> {
  res.json(await service.savePrintConfig(req.params.sheet, req.body as PrintConfigInput, getAuth(req).user.email));
}
