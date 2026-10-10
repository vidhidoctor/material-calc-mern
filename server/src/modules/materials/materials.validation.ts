import { z } from 'zod';
import { categoryCode } from '../material-categories/material-categories.validation.js';

export const materialCode = z
  .string({ error: 'Material code is required.' })
  .trim()
  .toUpperCase()
  .min(1, 'Material code is required.')
  .max(30, 'Material code is too long.')
  .regex(/^[A-Z0-9][A-Z0-9._-]*$/, 'Material code may only contain letters, numbers, dots, dashes and underscores.');

const materialFields = z.object({
  /** Optional: the code identifies a material; the name falls back to the code. */
  name: z.string({ error: 'Material name must be text.' }).trim().max(100, 'Material name is too long.').optional(),
  category: categoryCode,
  /** Values for the category's fields; required fields and "> 0" are checked against the category. */
  rules: z
    .record(z.string(), z.number({ error: 'Rule values must be numbers.' }).nullable(), { error: 'Rules must be an object of field → value.' })
    .default({}),
});

export const createMaterialBody = materialFields.extend({ code: materialCode });
export const updateMaterialBody = materialFields;
export const materialCodeParams = z.object({ code: materialCode });

export type CreateMaterialInput = z.infer<typeof createMaterialBody>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialBody>;
