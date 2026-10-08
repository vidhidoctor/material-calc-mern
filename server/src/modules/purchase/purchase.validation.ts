import { z } from 'zod';
import { orderNoParam } from '../orders/orders.validation.js';

/** ?orderNo=12&components=KALI,GALISH — both optional; empty values mean "not filtered". */
export const purchaseQuery = z.object({
  orderNo: z.preprocess((value) => (value === '' ? undefined : value), orderNoParam.optional()),
  components: z
    .string({ error: 'Components must be a comma-separated list.' })
    .optional()
    .transform((value) => [...new Set((value ?? '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean))]),
});

export type PurchaseQuery = z.infer<typeof purchaseQuery>;
