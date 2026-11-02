import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { designParams } from '../designs/designs.validation.js';
import { orderParams } from '../orders/orders.validation.js';
import * as controller from './costing.controller.js';
import { rateKeyParams, setRateBody, typeRateParams } from './costing.validation.js';
import { audited, param } from '../audit/audit.middleware.js';
import { parseVariantKey, variantKey } from '@app/shared';
import type { Request } from 'express';
import { typeRateKey } from './costing.service.js';

/** The stored rate key for a route key (code or CODE|COLOUR). */
const rateId = (req: Request) => { const { code, color } = parseVariantKey(String(req.params.key)); return variantKey(code, color); };

/** Mounted at /api/costing — ₹ rates and costs, Admin only (COST_VIEW). */
export const costingRoutes = Router();

costingRoutes.get('/rates', guard('COST_VIEW'), controller.listRates);
costingRoutes.put('/rates/:key', guard('COST_VIEW'), validate({ params: rateKeyParams, body: setRateBody }), audited({ action: 'RATE_SET', entity: 'Rate', id: rateId }), controller.setRate);
costingRoutes.delete('/rates/:key', guard('COST_VIEW'), validate({ params: rateKeyParams }), audited({ action: 'RATE_REMOVED', entity: 'Rate', id: rateId }), controller.deleteRate);
costingRoutes.get('/designs/:designNo', guard('COST_VIEW'), validate({ params: designParams }), controller.designCost);
costingRoutes.get('/orders/:orderNo', guard('COST_VIEW'), validate({ params: orderParams }), controller.orderCost);
costingRoutes.get('/type-rates', guard('COST_VIEW'), controller.listTypeRates);
costingRoutes.put('/type-rates/:category/:type', guard('COST_VIEW'), validate({ params: typeRateParams, body: setRateBody }), audited({ action: 'TYPE_RATE_SET', entity: 'Rate', id: (req) => typeRateKey(String(req.params.category), String(req.params.type)) }), controller.setTypeRate);
costingRoutes.get('/type-rate-tables', guard('COST_VIEW'), controller.listTypeRateTables);
costingRoutes.post('/orders/:orderNo/refresh-rates', guard('COST_VIEW'), validate({ params: orderParams }), audited({ action: 'ORDER_REPRICED', entity: 'Order', id: (req) => String(req.params.orderNo) }), controller.refreshOrderRates);
