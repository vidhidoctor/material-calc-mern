import { Router } from 'express';
import { guard, guardAny } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './orders.controller.js';
import { createOrderBody, orderCordsBody, orderParams, purchaseOrderNamesBody, updateOrderBody, updateStatusBody } from './orders.validation.js';

/** Mounted at /api/orders. */
export const ordersRoutes = Router();

ordersRoutes.get('/', guard('PRODUCTION_VIEW'), controller.list);
ordersRoutes.post('/', guard('PRODUCTION_CREATE'), validate({ body: createOrderBody }), controller.create);
ordersRoutes.get('/:orderNo', guard('PRODUCTION_VIEW'), validate({ params: orderParams }), controller.get);
ordersRoutes.put('/:orderNo', guard('PRODUCTION_UPDATE'), validate({ params: orderParams, body: updateOrderBody }), controller.update);
ordersRoutes.delete('/:orderNo', guard('PRODUCTION_UPDATE'), validate({ params: orderParams }), controller.remove);
ordersRoutes.patch(
  '/:orderNo/status',
  guard('PRODUCTION_UPDATE'),
  validate({ params: orderParams, body: updateStatusBody }),
  controller.updateStatus,
);
ordersRoutes.get('/:orderNo/breakdown', guard('PRODUCTION_VIEW'), validate({ params: orderParams }), controller.breakdown);
ordersRoutes.get('/:orderNo/purchase-order', guard('PRODUCTION_VIEW'), validate({ params: orderParams }), controller.purchaseOrder);
ordersRoutes.put(
  '/:orderNo/purchase-order/names',
  guardAny('PRODUCTION_UPDATE', 'PURCHASE_REQUIREMENT_VIEW'),
  validate({ params: orderParams, body: purchaseOrderNamesBody }),
  controller.savePurchaseOrderNames,
);
ordersRoutes.put('/:orderNo/cords', guard('PRODUCTION_UPDATE'), validate({ params: orderParams, body: orderCordsBody }), controller.saveCords);
ordersRoutes.post(
  '/:orderNo/cords/preview',
  guard('PRODUCTION_VIEW'),
  validate({ params: orderParams, body: orderCordsBody }),
  controller.previewCords,
);
ordersRoutes.get('/:orderNo/summary', guard('PRODUCTION_VIEW'), validate({ params: orderParams }), controller.summary);
