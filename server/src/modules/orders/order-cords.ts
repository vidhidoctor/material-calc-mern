import { isOrderEnteredField } from '@app/shared';
import type { Order } from './order.model.js';

/**
 * Cords: materials whose category has a Denier field. Their denier and rate per purchase unit (₹ per KG
 * incl. GST) are entered on each order, never in Material Master; weight = the category formula
 * (metres × denier ÷ 9,000,000 KG), cost = weight × rate.
 */

export interface OrderCordInput {
  denier: number | null;
  /** ₹ per purchase unit (KG) incl. GST. */
  ratePerUnit: number | null;
}

/** The category's order-entered Denier field, by its own key; null when the category is not a cord. */
export function denierFieldKey(category: { fields: { key: string }[] } | null | undefined): string | null {
  return category?.fields.find((f) => isOrderEnteredField(f.key))?.key ?? null;
}

/** Denier and rate entered on an order, per cord column key. */
export function orderCords(order: Pick<Order, 'cords'>): Map<string, OrderCordInput> {
  return new Map((order.cords ?? []).map((c) => [c.key, { denier: c.denier ?? null, ratePerUnit: c.ratePerUnit ?? null }]));
}

/**
 * A cord's rules for one order: the order's denier, never a Material Master value (none when the order
 * has no denier yet, so the weight is reported as missing). Other materials keep their rules.
 */
export function rulesForOrder<T extends Record<string, number | null | undefined>>(rules: T, denierField: string | null, denier: number | null | undefined): T {
  if (!denierField) return rules;
  const rest: Record<string, number | null | undefined> = { ...rules };
  for (const key of Object.keys(rest)) if (isOrderEnteredField(key)) delete rest[key];
  if (denier) rest[denierField] = denier;
  return rest as T;
}
