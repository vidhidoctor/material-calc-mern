import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './settings.controller.js';
import { addAdminEmailBody, adminEmailParams } from './settings.validation.js';
import { audited, param } from '../audit/audit.middleware.js';

/** Mounted at /api/settings — the global config. */
export const settingsRoutes = Router();

settingsRoutes.get('/', guard('SETTINGS_MANAGE'), controller.get);
settingsRoutes.post(
  '/admin-emails',
  guard('SETTINGS_MANAGE'),
  validate({ body: addAdminEmailBody }),
  audited({ action: 'ADMIN_EMAIL_ADDED', entity: 'Settings', id: () => 'global', detail: (req) => (req.body as { email: string }).email }),
  controller.addAdminEmail,
);
settingsRoutes.delete(
  '/admin-emails/:email',
  guard('SETTINGS_MANAGE'),
  validate({ params: adminEmailParams }),
  audited({ action: 'ADMIN_EMAIL_REMOVED', entity: 'Settings', id: () => 'global', detail: param('email') }),
  controller.removeAdminEmail,
);
