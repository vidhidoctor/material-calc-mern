import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { audited, param } from '../audit/audit.middleware.js';
import * as designsController from '../designs/designs.controller.js';
import { componentParams, designParams, listDesignsQuery, putComponentBody } from '../designs/designs.validation.js';
import * as controller from './design-costing.controller.js';
import { designCostingBody } from './design-costing.validation.js';

/** Mounted at /api/design-costing — the Manager's review of punching details, rates and pricing. */
export const designCostingRoutes = Router();

designCostingRoutes.get('/', guard('DESIGN_COSTING_VIEW'), validate({ query: listDesignsQuery }), controller.list);
designCostingRoutes.get('/:designNo', guard('DESIGN_COSTING_VIEW'), validate({ params: designParams }), controller.get);
// Calculates only: nothing is saved, so nothing is audited.
designCostingRoutes.post('/:designNo/preview', guard('DESIGN_COSTING_VIEW'), validate({ params: designParams, body: designCostingBody }), controller.preview);
designCostingRoutes.put(
  '/:designNo',
  guard('DESIGN_COSTING_MANAGE'),
  validate({ params: designParams, body: designCostingBody }),
  audited({ action: 'DESIGN_COSTING_SAVED', entity: 'DesignCosting', id: param('designNo') }),
  controller.save,
);
// The Manager edits punching details through the same service as the Punching Master.
designCostingRoutes.put(
  '/:designNo/components/:name',
  guard('DESIGN_COSTING_MANAGE'),
  validate({ params: componentParams, body: putComponentBody }),
  audited({ action: 'COMPONENT_SAVED', entity: 'Design', id: param('designNo'), detail: param('name') }),
  designsController.putComponent,
);
