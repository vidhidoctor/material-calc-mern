import { DEFAULT_COSTING_HEADS } from '@app/shared';
import { z } from 'zod';
import { componentName, sizeName } from '../designs/designs.validation.js';

const rate = (label: string) =>
  z
    .number({ error: `${label} must be a number.` })
    .min(0, `${label} cannot be negative.`)
    .max(10_000_000, `${label} is too large.`)
    .nullable()
    .default(null);

const quantity = (label: string) =>
  z
    .number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(0, `${label} cannot be negative.`)
    .max(1_000_000_000, `${label} is too large.`)
    .nullable()
    .default(null);

const heads = (label: string) =>
  z
    .number({ error: `${label} must be a number.` })
    .min(0, `${label} cannot be negative.`)
    .max(1000, `${label} is too large.`)
    .default(DEFAULT_COSTING_HEADS);

/** What the user enters. Also the body of a preview, which calculates without saving. */
export const jobWorkCostingBody = z.object({
  rows: z
    .array(
      z.object({
        component: componentName,
        size: sizeName,
        rate: rate('Job worker rate'),
        stitch: quantity('Stitches'),
        laser: quantity('Laser'),
        stitchRate: rate('Stitch rate'),
        laserRate: rate('Laser rate'),
        stitchHeads: heads('Stitch heads'),
        laserHeads: heads('Laser heads'),
        note: z.string({ error: 'Remarks must be text.' }).trim().max(200, 'Remarks are too long (200 characters at most).').default(''),
      }),
      { error: 'Rows must be a list.' },
    )
    .max(5000, 'Too many rows.'),
  excluded: z.array(z.string({ error: 'Material must be text.' }).max(200, 'Column key is too long.'), { error: 'Excluded materials must be a list.' }).max(500, 'Too many materials.'),
});

export type JobWorkCostingInput = z.infer<typeof jobWorkCostingBody>;
