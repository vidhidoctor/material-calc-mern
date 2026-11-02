import { Decimal } from './engine.js';

/**
 * Design Costing maths (pure). Per piece of one component + size:
 *   Stitch cost = stitches ÷ 1000 × stitch rate × stitch heads
 *   Laser cost  = laser ÷ 1000 × laser rate × laser heads
 *   Base cost   = stitch + laser + material
 *   Markup      = base × markup %
 *   Final price = base + markup
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

export function costOfSize(input: CostingSizeInput, markupPercent: number): CostingAmounts {
  const stitchCost = perThousand(input.stitch, input.stitchRate, input.stitchHeads);
  const laserCost = perThousand(input.laser, input.laserRate, input.laserHeads);
  const base = stitchCost.plus(laserCost).plus(input.materialCost);
  const markup = base.times(markupPercent).dividedBy(100);
  return { stitchCost, laserCost, materialCost: input.materialCost, base, markup, finalPrice: base.plus(markup) };
}

/** Totals are the sum of the unrounded amounts. */
export function sumCosts(list: readonly CostingAmounts[]): CostingAmounts {
  const zero = new Decimal(0);
  const total: CostingAmounts = { stitchCost: zero, laserCost: zero, materialCost: zero, base: zero, markup: zero, finalPrice: zero };
  const fields = Object.keys(total) as (keyof CostingAmounts)[];
  for (const amounts of list) for (const field of fields) total[field] = total[field].plus(amounts[field]);
  return total;
}
