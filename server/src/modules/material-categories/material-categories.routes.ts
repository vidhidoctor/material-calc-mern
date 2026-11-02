import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './material-categories.controller.js';
import { categoryParams, createCategoryBody, updateCategoryBody } from './material-categories.validation.js';
import { audited, param } from '../audit/audit.middleware.js';

/** Mounted at /api/material-categories (managed inside Material Master). */
export const materialCategoriesRoutes = Router();

materialCategoriesRoutes.get('/', guard('MATERIAL_MASTER_VIEW'), controller.list);
materialCategoriesRoutes.post('/', guard('MATERIAL_MASTER_MANAGE'), validate({ body: createCategoryBody }), audited({ action: 'CATEGORY_CREATED', entity: 'Category', id: (_req, body) => (body as { code?: unknown } | undefined)?.code as string | undefined }), controller.create);
materialCategoriesRoutes.put(
  '/:code',
  guard('MATERIAL_MASTER_MANAGE'),
  validate({ params: categoryParams, body: updateCategoryBody }),
  audited({ action: 'CATEGORY_UPDATED', entity: 'Category', id: param('code') }),
  controller.update,
);
materialCategoriesRoutes.delete('/:code', guard('MATERIAL_MASTER_MANAGE'), validate({ params: categoryParams }), audited({ action: 'CATEGORY_DELETED', entity: 'Category', id: param('code') }), controller.remove);
