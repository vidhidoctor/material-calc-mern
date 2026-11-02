import { Router } from 'express';
import { authenticate, guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './audit.controller.js';
import { auditQuery, entityHistoryParams } from './audit.validation.js';

/** Mounted at /api/audit-logs. Read-only: entries are never changed or deleted. */
export const auditRoutes = Router();

auditRoutes.get('/', guard('AUDIT_VIEW'), validate({ query: auditQuery }), controller.list);
// A record's History: AUDIT_VIEW or the permission that shows that record (checked in the service).
auditRoutes.get('/entity/:type/:id', authenticate, validate({ params: entityHistoryParams }), controller.history);
