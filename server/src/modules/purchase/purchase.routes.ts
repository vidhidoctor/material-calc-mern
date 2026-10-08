import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './purchase.controller.js';
import { purchaseQuery } from './purchase.validation.js';

/** Mounted at /api/purchase. */
export const purchaseRoutes = Router();

purchaseRoutes.get('/requirements', guard('PURCHASE_REQUIREMENT_VIEW'), validate({ query: purchaseQuery }), controller.requirements);
