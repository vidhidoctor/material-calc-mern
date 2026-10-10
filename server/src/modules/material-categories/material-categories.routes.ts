import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './material-categories.controller.js';
import { categoryParams, createCategoryBody, updateCategoryBody } from './material-categories.validation.js';

/** Mounted at /api/material-categories (managed inside Material Master). */
export const materialCategoriesRoutes = Router();

materialCategoriesRoutes.get('/', guard('MATERIAL_MASTER_VIEW'), controller.list);
materialCategoriesRoutes.post('/', guard('MATERIAL_MASTER_MANAGE'), validate({ body: createCategoryBody }), controller.create);
materialCategoriesRoutes.put(
  '/:code',
  guard('MATERIAL_MASTER_MANAGE'),
  validate({ params: categoryParams, body: updateCategoryBody }),
  controller.update,
);
materialCategoriesRoutes.delete('/:code', guard('MATERIAL_MASTER_MANAGE'), validate({ params: categoryParams }), controller.remove);
