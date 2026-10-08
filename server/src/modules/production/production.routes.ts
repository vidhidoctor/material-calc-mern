import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './production.controller.js';
import { designParams, listDesignsQuery } from './production.validation.js';

/** Mounted at /api/production — read-only design search for Production. */
export const productionRoutes = Router();

productionRoutes.get('/designs', guard('PRODUCTION_VIEW'), validate({ query: listDesignsQuery }), controller.listDesigns);
productionRoutes.get('/designs/:designNo', guard('PRODUCTION_VIEW'), validate({ params: designParams }), controller.getDesign);
