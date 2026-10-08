import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './materials.controller.js';
import { createMaterialBody, materialCodeParams, updateMaterialBody } from './materials.validation.js';

/** Mounted at /api/materials. */
export const materialsRoutes = Router();

materialsRoutes.get('/', guard('MATERIAL_MASTER_VIEW'), controller.list);
materialsRoutes.post('/', guard('MATERIAL_MASTER_MANAGE'), validate({ body: createMaterialBody }), controller.create);
materialsRoutes.put(
  '/:code',
  guard('MATERIAL_MASTER_MANAGE'),
  validate({ params: materialCodeParams, body: updateMaterialBody }),
  controller.update,
);
materialsRoutes.delete('/:code', guard('MATERIAL_MASTER_MANAGE'), validate({ params: materialCodeParams }), controller.remove);
