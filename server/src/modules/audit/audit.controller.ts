import type { AuditEntityType } from '@app/shared';
import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import { entityHistory, listAudit } from './audit.service.js';
import type { AuditQuery } from './audit.validation.js';

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await listAudit(req.query as unknown as AuditQuery));
}

export async function history(req: Request, res: Response): Promise<void> {
  const { type, id } = req.params as { type: AuditEntityType; id: string };
  res.json(await entityHistory(type, id, getAuth(req).permissions));
}
