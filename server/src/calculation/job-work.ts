import { perThousand } from './design-costing.js';
import { Decimal } from './engine.js';

/**
 * Job Work Costing maths (pure). Per piece of one component + size:
 *   Stitch cost = stitches ÷ 1000 × stitch rate × stitch heads  (same formula as the design costing)
 *   Laser cost  = laser ÷ 1000 × laser rate × laser heads
 *   Final job work cost = job worker's rate + stitch cost + laser cost + costs of the materials marked for inclusion.
 * Excluded materials are already covered by the job worker's rate: shown for reference, never added.
 */

export interface JobWorkAmounts {
  rate: Decimal;
  stitchCost: Decimal;
  laserCost: Decimal;
  includedMaterials: Decimal;
  excludedMaterials: Decimal;
  finalCost: Decimal;
}

export interface JobWorkSizeInput {
  rate: number | null;
  stitch: number;
  laser: number | null;
  stitchRate: number | null;
  laserRate: number | null;
  stitchHeads: number;
  laserHeads: number;
  includedMaterials: Decimal;
  excludedMaterials: Decimal;
}

export function jobWorkCost(input: JobWorkSizeInput): JobWorkAmounts {
  const rate = new Decimal(input.rate ?? 0);
  const stitchCost = perThousand(input.stitch, input.stitchRate, input.stitchHeads);
  const laserCost = perThousand(input.laser, input.laserRate, input.laserHeads);
  const { includedMaterials, excludedMaterials } = input;
  return { rate, stitchCost, laserCost, includedMaterials, excludedMaterials, finalCost: rate.plus(stitchCost).plus(laserCost).plus(includedMaterials) };
}

/** Totals are the sum of the unrounded amounts. */
export function sumJobWork(list: readonly JobWorkAmounts[]): JobWorkAmounts {
  const zero = new Decimal(0);
  return list.reduce(
    (total, a) => ({
      rate: total.rate.plus(a.rate),
      stitchCost: total.stitchCost.plus(a.stitchCost),
      laserCost: total.laserCost.plus(a.laserCost),
      includedMaterials: total.includedMaterials.plus(a.includedMaterials),
      excludedMaterials: total.excludedMaterials.plus(a.excludedMaterials),
      finalCost: total.finalCost.plus(a.finalCost),
    }),
    { rate: zero, stitchCost: zero, laserCost: zero, includedMaterials: zero, excludedMaterials: zero, finalCost: zero },
  );
}
