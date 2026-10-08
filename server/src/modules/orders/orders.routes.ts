import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './orders.controller.js';
import { createOrderBody, orderParams, updateStatusBody } from './orders.validation.js';

/** Mounted at /api/orders. */
export const ordersRoutes = Router();

ordersRoutes.get('/', guard('PRODUCTION_VIEW'), controller.list);
ordersRoutes.post('/', guard('PRODUCTION_CREATE'), validate({ body: createOrderBody }), controller.create);
ordersRoutes.get('/:orderNo', guard('PRODUCTION_VIEW'), validate({ params: orderParams }), controller.get);
ordersRoutes.patch(
  '/:orderNo/status',
  guard('PRODUCTION_UPDATE'),
  validate({ params: orderParams, body: updateStatusBody }),
  controller.updateStatus,
);
ordersRoutes.get('/:orderNo/summary', guard('PRODUCTION_VIEW'), validate({ params: orderParams }), controller.summary);
