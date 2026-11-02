import { DEFAULT_COSTING_HEADS } from '@app/shared';
import { z } from 'zod';
import { componentName, sizeName } from '../designs/designs.validation.js';
import { orderCordsBody } from '../orders/orders.validation.js';

const rate = (label: string) =>
  z
    .number({ error: `${label} must be a number.` })
    .min(0, `${label} cannot be negative.`)
    .max(10_000_000, `${label} is too large.`)
    .nullable();

const heads = (label: string) =>
  z
    .number({ error: `${label} must be a number.` })
    .min(0, `${label} cannot be negative.`)
    .max(1000, `${label} is too large.`)
    .default(DEFAULT_COSTING_HEADS);

/** What the Manager enters. Also the body of a preview, which calculates without saving. */
export const designCostingBody = z.object({
  markupPercent: z.number({ error: 'Markup must be a number.' }).min(0, 'Markup cannot be negative.').max(1000, 'Markup is too large (1000% at most).'),
  rows: z
    .array(
      z.object({
        component: componentName,
        size: sizeName,
        stitchRate: rate('Stitch rate'),
        laserRate: rate('Laser rate'),
        stitchHeads: heads('Stitch heads'),
        laserHeads: heads('Laser heads'),
        note: z.string({ error: 'Remarks must be text.' }).trim().max(200, 'Remarks are too long (200 characters at most).').default(''),
      }),
      { error: 'Rows must be a list.' },
    )
    .max(5000, 'Too many rows.'),
  types: z
    .record(z.string().max(200, 'Column key is too long.'), z.string({ error: 'Type must be text.' }).max(100, 'Type is too long.'), { error: 'Types must be an object of column → type.' })
    .refine((t) => Object.keys(t).length <= 500, 'Too many types.'),
  cords: orderCordsBody.shape.cords,
});

export type DesignCostingInput = z.infer<typeof designCostingBody>;
