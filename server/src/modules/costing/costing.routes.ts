import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { designParams } from '../designs/designs.validation.js';
import { orderParams } from '../orders/orders.validation.js';
import * as controller from './costing.controller.js';
import { rateKeyParams, setRateBody, typeRateParams } from './costing.validation.js';

/** Mounted at /api/costing — ₹ rates and costs, Admin only (COST_VIEW). */
export const costingRoutes = Router();

costingRoutes.get('/rates', guard('COST_VIEW'), controller.listRates);
costingRoutes.put('/rates/:key', guard('COST_VIEW'), validate({ params: rateKeyParams, body: setRateBody }), controller.setRate);
costingRoutes.delete('/rates/:key', guard('COST_VIEW'), validate({ params: rateKeyParams }), controller.deleteRate);
costingRoutes.get('/designs/:designNo', guard('COST_VIEW'), validate({ params: designParams }), controller.designCost);
costingRoutes.get('/orders/:orderNo', guard('COST_VIEW'), validate({ params: orderParams }), controller.orderCost);
costingRoutes.get('/type-rates', guard('COST_VIEW'), controller.listTypeRates);
costingRoutes.put('/type-rates/:category/:type', guard('COST_VIEW'), validate({ params: typeRateParams, body: setRateBody }), controller.setTypeRate);
