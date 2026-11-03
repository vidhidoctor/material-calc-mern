import { Router, type RequestHandler } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { audited, param } from '../audit/audit.middleware.js';
import * as controller from './print-config.controller.js';
import { printConfigBody, printConfigParams } from './print-config.validation.js';

/** Mounted at /api/print-config — which columns each printed costing sheet shows. Anyone who can print reads it; only Managers change it. */
export const printConfigRoutes = Router();

printConfigRoutes.get('/:sheet', guard('DESIGN_COSTING_VIEW'), validate({ params: printConfigParams }), controller.get as unknown as RequestHandler);
printConfigRoutes.put(
  '/:sheet',
  guard('DESIGN_COSTING_MANAGE'),
  validate({ params: printConfigParams, body: printConfigBody }),
  audited({ action: 'PRINT_CONFIG_SAVED', entity: 'PrintConfig', id: param('sheet') }),
  controller.save as unknown as RequestHandler,
);
