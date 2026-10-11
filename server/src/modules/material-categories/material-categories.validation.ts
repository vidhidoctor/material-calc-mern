import { COLOR_PATTERN, normalizeType } from '@app/shared';
import { z } from 'zod';
import { requiredName } from '../../lib/zod.js';

export const categoryCode = z
  .string({ error: 'Category code is required.' })
  .trim()
  .toUpperCase()
  .min(1, 'Category code is required.')
  .max(30, 'Category code is too long.')
  .regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'Category code may only contain letters, numbers, dashes and underscores.');

const fieldRow = z.object({
  key: z.string({ error: 'Field name is required.' }).trim().min(1, 'Field name is required.').max(30, 'Field name is too long.'),
  label: requiredName('Field label'),
  required: z.boolean().default(true),
  missingMessage: z.string().trim().max(200).nullable().optional(),
});

const stepRow = z.object({
  key: z.string({ error: 'Step name is required.' }).trim().min(1, 'Step name is required.').max(30, 'Step name is too long.'),
  label: requiredName('Step label'),
  formula: z.string({ error: 'Formula is required.' }).trim().min(1, 'Formula is required.').max(300, 'Formula is too long.'),
});

const categoryFields = z.object({
  name: requiredName('Category name'),
  unit: z
    .string({ error: 'Unit is required.' })
    .trim()
    .toUpperCase()
    .min(1, 'Unit is required.')
    .max(10, 'Unit is too long.'),
  fields: z.array(fieldRow, { error: 'Fields must be a list.' }).default([]),
  steps: z.array(stepRow, { error: 'Steps must be a list.' }).min(1, 'Add at least one formula step.'),
  purchaseStep: z.string({ error: 'Choose which step is the purchase quantity.' }).trim().min(1, 'Choose which step is the purchase quantity.'),
  /** Types chosen per order in Production (e.g. MATT, METAL, PURE GLASS). */
  types: z
    .array(
      z
        .string({ error: 'Type names must be text.' })
        .transform((t) => normalizeType(t) ?? '')
        .pipe(
          z
            .string()
            .min(1, 'Type name is required.')
            .max(30, 'Type name is too long.')
            .regex(COLOR_PATTERN, 'Type names may only contain letters, numbers, spaces, dots, dashes, & and /.'),
        ),
      { error: 'Types must be a list.' },
    )
    .default([])
    .superRefine((types, ctx) => {
      const seen = new Set<string>();
      types.forEach((t, i) => {
        if (seen.has(t)) ctx.addIssue({ code: 'custom', path: [i], message: `Type ${t} is listed twice.` });
        seen.add(t);
      });
    }),
});

export const createCategoryBody = categoryFields.extend({ code: categoryCode });
export const updateCategoryBody = categoryFields;
export const categoryParams = z.object({ code: categoryCode });

export type CreateCategoryInput = z.infer<typeof createCategoryBody>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryBody>;
