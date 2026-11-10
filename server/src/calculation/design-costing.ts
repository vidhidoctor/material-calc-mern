import { Decimal } from './engine.js';

/**
 * Design Costing maths (pure). Per piece of one component + size:
 *   Stitch cost = stitches ÷ 1000 × stitch rate × stitch heads
 *   Laser cost  = laser ÷ 1000 × laser rate × laser heads
 *   Base cost   = stitch + laser + material
 *   Final price = base ÷ (1 − discount %)   so that after the party's discount the business receives the base cost
 *   Markup      = final price − base
 * Discount must be below 100 (validated at the API).
 */

export interface CostingAmounts {
  stitchCost: Decimal;
  laserCost: Decimal;
  materialCost: Decimal;
  base: Decimal;
  markup: Decimal;
  finalPrice: Decimal;
}

export interface CostingSizeInput {
  stitch: number;
  laser: number | null;
  stitchRate: number | null;
  laserRate: number | null;
  stitchHeads: number;
  laserHeads: number;
  materialCost: Decimal;
}

export const perThousand = (quantity: number | null, rate: number | null, heads: number) => new Decimal(quantity ?? 0).dividedBy(1000).times(rate ?? 0).times(heads);

export function costOfSize(input: CostingSizeInput, discountPercent: number): CostingAmounts {
  const stitchCost = perThousand(input.stitch, input.stitchRate, input.stitchHeads);
  const laserCost = perThousand(input.laser, input.laserRate, input.laserHeads);
  const base = stitchCost.plus(laserCost).plus(input.materialCost);
  const finalPrice = base.dividedBy(new Decimal(1).minus(new Decimal(discountPercent).dividedBy(100)));
  return { stitchCost, laserCost, materialCost: input.materialCost, base, markup: finalPrice.minus(base), finalPrice };
}

/** The markup % a discount needs: 7% discount → 7.53% markup (7 ÷ 93 × 100). */
export function markupPercentFor(discountPercent: number): Decimal {
  return new Decimal(discountPercent).dividedBy(new Decimal(100).minus(discountPercent)).times(100);
}

/** Totals are the sum of the unrounded amounts. */
export function sumCosts(list: readonly CostingAmounts[]): CostingAmounts {
  const zero = new Decimal(0);
  const total: CostingAmounts = { stitchCost: zero, laserCost: zero, materialCost: zero, base: zero, markup: zero, finalPrice: zero };
  const fields = Object.keys(total) as (keyof CostingAmounts)[];
  for (const amounts of list) for (const field of fields) total[field] = total[field].plus(amounts[field]);
  return total;
}
