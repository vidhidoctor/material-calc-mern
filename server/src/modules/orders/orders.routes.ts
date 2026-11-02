import { Router } from 'express';
import { guard, guardAny } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './orders.controller.js';
import { createOrderBody, orderCordsBody, orderParams, purchaseOrderNamesBody, updateOrderBody, updateStatusBody } from './orders.validation.js';
import { audited } from '../audit/audit.middleware.js';

/** Mounted at /api/orders. */
export const ordersRoutes = Router();

ordersRoutes.get('/', guard('PRODUCTION_VIEW'), controller.list);
ordersRoutes.post('/', guard('PRODUCTION_CREATE'), validate({ body: createOrderBody }), audited({ action: 'ORDER_CREATED', entity: 'Order', id: (_req, body) => (body as { orderNo?: number } | undefined)?.orderNo?.toString() }), controller.create);
ordersRoutes.get('/:orderNo', guard('PRODUCTION_VIEW'), validate({ params: orderParams }), controller.get);
ordersRoutes.put('/:orderNo', guard('PRODUCTION_UPDATE'), validate({ params: orderParams, body: updateOrderBody }), audited({ action: 'ORDER_UPDATED', entity: 'Order', id: (req) => String(req.params.orderNo) }), controller.update);
ordersRoutes.delete('/:orderNo', guard('PRODUCTION_UPDATE'), validate({ params: orderParams }), audited({ action: 'ORDER_DELETED', entity: 'Order', id: (req) => String(req.params.orderNo) }), controller.remove);
ordersRoutes.patch(
  '/:orderNo/status',
  guard('PRODUCTION_UPDATE'),
  validate({ params: orderParams, body: updateStatusBody }),
  audited({ action: 'ORDER_STATUS_CHANGED', entity: 'Order', id: (req) => String(req.params.orderNo) }),
  controller.updateStatus,
);
ordersRoutes.get('/:orderNo/breakdown', guard('PRODUCTION_VIEW'), validate({ params: orderParams }), controller.breakdown);
ordersRoutes.get('/:orderNo/purchase-order', guard('PRODUCTION_VIEW'), validate({ params: orderParams }), controller.purchaseOrder);
ordersRoutes.put(
  '/:orderNo/purchase-order/names',
  guardAny('PRODUCTION_UPDATE', 'PURCHASE_REQUIREMENT_VIEW'),
  validate({ params: orderParams, body: purchaseOrderNamesBody }),
  audited({ action: 'PO_NAMES_SAVED', entity: 'Order', id: (req) => String(req.params.orderNo) }),
  controller.savePurchaseOrderNames,
);
ordersRoutes.put('/:orderNo/cords', guard('PRODUCTION_UPDATE'), validate({ params: orderParams, body: orderCordsBody }), audited({ action: 'ORDER_CORDS_SAVED', entity: 'Order', id: (req) => String(req.params.orderNo) }), controller.saveCords);
ordersRoutes.post(
  '/:orderNo/cords/preview',
  guard('PRODUCTION_VIEW'),
  validate({ params: orderParams, body: orderCordsBody }),
  controller.previewCords,
);
ordersRoutes.get('/:orderNo/summary', guard('PRODUCTION_VIEW'), validate({ params: orderParams }), controller.summary);
