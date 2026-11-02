import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { audited, param } from '../audit/audit.middleware.js';
import { designParams } from '../designs/designs.validation.js';
import * as controller from './job-work-costing.controller.js';
import { jobWorkCostingBody } from './job-work-costing.validation.js';

/** Mounted at /api/job-work-costing — what a job worker is paid per piece, separate from the design costing. */
export const jobWorkCostingRoutes = Router();

jobWorkCostingRoutes.get('/:designNo', guard('DESIGN_COSTING_VIEW'), validate({ params: designParams }), controller.get);
// Calculates only: nothing is saved, so nothing is audited.
jobWorkCostingRoutes.post('/:designNo/preview', guard('DESIGN_COSTING_VIEW'), validate({ params: designParams, body: jobWorkCostingBody }), controller.preview);
jobWorkCostingRoutes.put(
  '/:designNo',
  guard('DESIGN_COSTING_MANAGE'),
  validate({ params: designParams, body: jobWorkCostingBody }),
  audited({ action: 'JOB_WORK_COSTING_SAVED', entity: 'JobWorkCosting', id: param('designNo') }),
  controller.save,
);
