import { z } from 'zod';

const upperText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .toUpperCase()
    .min(1, `${label} is required.`)
    .max(max, `${label} is too long.`);

export const designNo = upperText('Design number', 30).regex(
  /^[A-Z0-9][A-Z0-9._-]*$/,
  'Design number may only contain letters, numbers, dots, dashes and underscores.',
);

export const componentName = upperText('Component name', 40).regex(
  /^[A-Z0-9][A-Z0-9 ._-]*$/,
  'Component name may only contain letters, numbers, spaces, dots, dashes and underscores.',
);

export const sizeName = upperText('Size', 10).regex(
  /^[A-Z0-9][A-Z0-9 ._-]*$/,
  'Size may only contain letters, numbers, spaces, dots, dashes and underscores.',
);

const wholeNumber = (label: string) =>
  z
    .number({ error: `${label} is required.` })
    .int(`${label} must be a whole number.`)
    .min(0, `${label} cannot be negative.`);

const sizeRow = z.object({
  size: sizeName,
  stitch: wholeNumber('Stitch'),
  laser: wholeNumber('Laser').nullable().optional(),
  consumption: z
    .record(z.string(), z.number({ error: 'Consumption must be a number.' }).min(0, 'Consumption cannot be negative.'), {
      error: 'Consumption must be an object of material code → quantity.',
    })
    .default({}),
});

export const listDesignsQuery = z.object({
  q: z.string({ error: 'Search must be text.' }).trim().max(50, 'Search is too long.').optional(),
});

export const createDesignBody = z.object({
  designNo,
  productName: upperText('Product name', 100),
});

export const updateDesignBody = z
  .object({
    designNo: designNo.optional(),
    productName: upperText('Product name', 100).optional(),
  })
  .refine((v) => v.designNo !== undefined || v.productName !== undefined, 'Nothing to change.');

export type UpdateDesignInput = z.infer<typeof updateDesignBody>;

export const putComponentBody = z.object({
  /** Columns chosen for this component ("SEQ-3MM" or "SEQ-3MM|WHITE"); columns with a quantity are always included. */
  columns: z.array(z.string({ error: 'Columns must be text.' }).trim(), { error: 'Columns must be a list.' }).optional(),
  sizes: z
    .array(sizeRow, { error: 'Sizes must be a list.' })
    .min(1, 'Add at least one size.')
    .superRefine((sizes, ctx) => {
      const seen = new Set<string>();
      sizes.forEach((row, index) => {
        if (seen.has(row.size)) {
          ctx.addIssue({ code: 'custom', path: [index, 'size'], message: `Size ${row.size} is listed twice.` });
        }
        seen.add(row.size);
      });
    }),
});

export const designParams = z.object({ designNo });
export const componentParams = z.object({ designNo, name: componentName });

export type CreateDesignInput = z.infer<typeof createDesignBody>;
export type PutComponentInput = z.infer<typeof putComponentBody>;
