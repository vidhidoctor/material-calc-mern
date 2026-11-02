import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './materials.controller.js';
import { createMaterialBody, materialCodeParams, updateMaterialBody } from './materials.validation.js';
import { audited, param } from '../audit/audit.middleware.js';

/** Mounted at /api/materials. */
export const materialsRoutes = Router();

materialsRoutes.get('/', guard('MATERIAL_MASTER_VIEW'), controller.list);
materialsRoutes.post('/', guard('MATERIAL_MASTER_MANAGE'), validate({ body: createMaterialBody }), audited({ action: 'MATERIAL_CREATED', entity: 'Material', id: (_req, body) => (body as { code?: unknown } | undefined)?.code as string | undefined }), controller.create);
materialsRoutes.put(
  '/:code',
  guard('MATERIAL_MASTER_MANAGE'),
  validate({ params: materialCodeParams, body: updateMaterialBody }),
  audited({ action: 'MATERIAL_UPDATED', entity: 'Material', id: param('code') }),
  controller.update,
);
materialsRoutes.delete('/:code', guard('MATERIAL_MASTER_MANAGE'), validate({ params: materialCodeParams }), audited({ action: 'MATERIAL_DELETED', entity: 'Material', id: param('code') }), controller.remove);
