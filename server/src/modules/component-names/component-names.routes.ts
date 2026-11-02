import { Router } from 'express';
import { guard, guardAny } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './component-names.controller.js';
import { componentNameParams, createComponentNameBody } from './component-names.validation.js';
import { audited, param } from '../audit/audit.middleware.js';

/** Mounted at /api/component-names: Punching's component list, managed in Material Master. */
export const componentNamesRoutes = Router();

componentNamesRoutes.get('/', guardAny('PUNCHING_VIEW', 'MATERIAL_MASTER_VIEW', 'DESIGN_COSTING_MANAGE'), controller.list);
componentNamesRoutes.post('/', guard('MATERIAL_MASTER_MANAGE'), validate({ body: createComponentNameBody }), audited({ action: 'COMPONENT_NAME_ADDED', entity: 'ComponentName', id: (req) => (req.body as { name: string }).name }), controller.create);
componentNamesRoutes.delete('/:name', guard('MATERIAL_MASTER_MANAGE'), validate({ params: componentNameParams }), audited({ action: 'COMPONENT_NAME_REMOVED', entity: 'ComponentName', id: param('name') }), controller.remove);
