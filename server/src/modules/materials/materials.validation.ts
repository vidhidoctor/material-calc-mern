import { MATERIAL_CATEGORIES, MATERIAL_CATEGORY_LABELS, RULE_FIELD_LABELS, RULE_FIELDS, type MaterialRuleField } from '@app/shared';
import { z } from 'zod';

export const materialCode = z
  .string({ error: 'Material code is required.' })
  .trim()
  .toUpperCase()
  .min(1, 'Material code is required.')
  .max(30, 'Material code is too long.')
  .regex(/^[A-Z0-9][A-Z0-9._-]*$/, 'Material code may only contain letters, numbers, dots, dashes and underscores.');

const ruleValue = (field: MaterialRuleField) =>
  z
    .number({ error: `${RULE_FIELD_LABELS[field]} must be a number.` })
    .positive(`${RULE_FIELD_LABELS[field]} must be greater than 0.`)
    .nullable()
    .optional();

const materialFields = z.object({
  /** Optional: the code identifies a material; the name falls back to the code. */
  name: z.string({ error: 'Material name must be text.' }).trim().max(100, 'Material name is too long.').optional(),
  category: z.enum(MATERIAL_CATEGORIES, { error: 'Choose a category: SEQUENCE, BEAD or CORD.' }),
  seqPerCd: ruleValue('seqPerCd'),
  cdPerRoll: ruleValue('cdPerRoll'),
  cdPerRound: ruleValue('cdPerRound'),
  pcsPerKg: ruleValue('pcsPerKg'),
  denier: ruleValue('denier'),
});

type MaterialFields = z.infer<typeof materialFields>;

/** The rule fields of the chosen category are required. */
function requireCategoryRules(value: MaterialFields, ctx: z.RefinementCtx): void {
  for (const field of RULE_FIELDS[value.category].required) {
    if (value[field] == null) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `${RULE_FIELD_LABELS[field]} is required for ${MATERIAL_CATEGORY_LABELS[value.category]} materials.`,
      });
    }
  }
}

export const createMaterialBody = materialFields.extend({ code: materialCode }).superRefine(requireCategoryRules);
export const updateMaterialBody = materialFields.superRefine(requireCategoryRules);
export const materialCodeParams = z.object({ code: materialCode });

export type CreateMaterialInput = z.infer<typeof createMaterialBody>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialBody>;
