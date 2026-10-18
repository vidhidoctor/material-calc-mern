import { MESSAGES, ORDER_STATUSES } from '@app/shared';
import { z } from 'zod';
import { requiredName } from '../../lib/zod.js';
import { componentName, designNo, sizeName } from '../designs/designs.validation.js';

const INVALID_QUANTITY = MESSAGES.INVALID_ORDER_QUANTITY;

const isValidQuantity = (value: number): boolean => Number.isInteger(value) && value > 0;

export const dateOnly = z
  .string({ error: 'Order date must be a date (YYYY-MM-DD).' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Order date must be a date (YYYY-MM-DD).')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'Order date is not a valid date.');

const orderLine = z.object({
  component: componentName,
  size: sizeName,
  quantity: z.number({ error: INVALID_QUANTITY }),
});

const orderFields = z.object({
  party: requiredName('Party').toUpperCase(),
  orderDate: dateOnly.optional(),
  quantity: z.number({ error: INVALID_QUANTITY }).nullable().optional(),
  lines: z.array(orderLine, { error: 'Lines must be a list.' }).optional(),
  /** Type per typed column of the design, e.g. { "SEQ-3MM|PINK": "MATT" } (chosen in Production). */
  types: z
    .record(z.string(), z.string({ error: 'Types must be text.' }), { error: 'Types must be an object of column → type.' })
    .default({}),
});

/**
 * Either one `quantity` for every component + size ("Same for all rows"),
 * or `lines` with a quantity per row ("Different per row"; 0 = not ordered).
 */
function checkQuantities(value: z.infer<typeof orderFields>, ctx: z.RefinementCtx): void {
  if (value.lines === undefined) {
    if (value.quantity == null || !isValidQuantity(value.quantity)) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: INVALID_QUANTITY });
    }
    return;
  }
  if (value.quantity != null) {
    ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Send either one Order Quantity or quantities per row, not both.' });
    return;
  }
  const seen = new Set<string>();
  value.lines.forEach((line, index) => {
    if (line.quantity !== 0 && !isValidQuantity(line.quantity)) {
      ctx.addIssue({ code: 'custom', path: ['lines', index, 'quantity'], message: `${line.component} ${line.size}: ${INVALID_QUANTITY}` });
    }
    const key = `${line.component} ${line.size}`;
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['lines', index], message: `${key} is listed twice.` });
    seen.add(key);
  });
  if (!value.lines.some((line) => line.quantity > 0)) {
    ctx.addIssue({ code: 'custom', path: ['lines'], message: INVALID_QUANTITY });
  }
}

export const createOrderBody = orderFields.extend({ designNo }).superRefine(checkQuantities);

/** Every field of an order can be edited except its design. */
export const updateOrderBody = orderFields.superRefine(checkQuantities);

export const orderNoParam = z
  .string({ error: 'Invalid order number.' })
  .regex(/^\d+$/, 'Invalid order number.')
  .transform(Number);

export const orderParams = z.object({ orderNo: orderNoParam });

/** Names written on the purchase order slip: row id → name (printed exactly as entered; blank removes it). */
export const purchaseOrderNamesBody = z.object({
  names: z
    .record(
      z.string().max(200, 'Row id is too long.'),
      z.string({ error: 'Name must be text.' }).max(100, 'Name is too long (100 characters at most).'),
      { error: 'Names must be an object.' },
    )
    .refine((names) => Object.keys(names).length <= 500, 'Too many names.'),
});
export type PurchaseOrderNamesInput = z.infer<typeof purchaseOrderNamesBody>;

export const updateStatusBody = z.object({
  status: z.enum(ORDER_STATUSES, { error: 'Choose a valid status: PENDING, IN_PROGRESS, COMPLETED or CANCELLED.' }),
});

export type CreateOrderInput = z.infer<typeof createOrderBody>;
export type UpdateOrderInput = z.infer<typeof updateOrderBody>;
