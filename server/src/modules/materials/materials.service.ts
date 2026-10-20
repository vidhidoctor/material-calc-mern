import { isOrderEnteredField, type MaterialColumnDto, type MaterialDto } from '@app/shared';
import { compileCategory, type CompiledCategory } from '../../calculation/engine.js';
import { AppError } from '../../lib/app-error.js';
import { DesignModel } from '../designs/design.model.js';
import { MaterialCategoryModel, type MaterialCategory } from '../material-categories/material-category.model.js';
import { MaterialModel, type Material, type MaterialDocument } from './material.model.js';
import type { CreateMaterialInput, UpdateMaterialInput } from './materials.validation.js';

export const MATERIAL_MESSAGES = {
  NOT_FOUND: 'Material not found.',
  CODE_TAKEN: 'A material with this code already exists.',
  IN_USE: 'This material is used by a design and cannot be removed.',
  unknownCategory: (code: string) => `Unknown category ${code}. Add it under Material Master → Categories first.`,
  required: (label: string, category: string) => `${label} is required for ${category} materials.`,
  positive: (label: string) => `${label} must be greater than 0.`,
} as const;

export type CategoryMap = Map<string, MaterialCategory>;

/** Compiled formulas per category code; a category that does not compile maps to null (reported, never thrown). */
export function compileCategories(categories: CategoryMap): Map<string, CompiledCategory | null> {
  const compiled = new Map<string, CompiledCategory | null>();
  for (const [code, c] of categories) {
    try {
      compiled.set(
        code,
        compileCategory({
          code: c.code,
          name: c.name,
          fields: c.fields.map((f) => ({ key: f.key, label: f.label, required: f.required, missingMessage: f.missingMessage })),
          steps: c.steps.map((s) => ({ key: s.key, label: s.label, formula: s.formula })),
          purchaseStep: c.purchaseStep,
        }),
      );
    } catch {
      compiled.set(code, null);
    }
  }
  return compiled;
}

export async function loadCategoryMap(): Promise<CategoryMap> {
  return new Map((await MaterialCategoryModel.find()).map((c) => [c.code, c]));
}

export function toMaterialColumn(material: Material, categories: CategoryMap): MaterialColumnDto {
  const category = categories.get(material.category);
  return {
    code: material.code,
    name: material.name,
    category: material.category,
    unit: category?.unit ?? '',
    typed: (category?.types?.length ?? 0) > 0,
    cord: category?.fields.some((f) => isOrderEnteredField(f.key)) ?? false,
  };
}

function toMaterialDto(material: Material, categories: CategoryMap): MaterialDto {
  return {
    ...toMaterialColumn(material, categories),
    categoryName: categories.get(material.category)?.name ?? material.category,
    sortOrder: material.sortOrder,
    rules: { ...(material.rules ?? {}) },
  };
}

/**
 * Keeps only the category's fields; required ones must be present; all must be > 0. Fields entered on
 * each order (cord denier) are not kept here.
 */
async function categoryRules(input: UpdateMaterialInput): Promise<{ category: string; rules: Record<string, number> }> {
  const category = await MaterialCategoryModel.findOne({ code: input.category });
  if (!category) throw new AppError(400, MATERIAL_MESSAGES.unknownCategory(input.category));
  const given = new Map(Object.entries(input.rules).map(([key, value]) => [key.toUpperCase(), value]));
  const rules: Record<string, number> = {};
  for (const field of category.fields) {
    if (isOrderEnteredField(field.key)) continue;
    const value = given.get(field.key.toUpperCase());
    if (value === undefined || value === null) {
      if (field.required) throw new AppError(400, MATERIAL_MESSAGES.required(field.label, category.name));
      continue;
    }
    if (!(value > 0)) throw new AppError(400, MATERIAL_MESSAGES.positive(field.label));
    rules[field.key] = value;
  }
  return { category: category.code, rules };
}

/** All materials in display order — the material list IS the set of consumption columns. */
export async function findAllMaterials(): Promise<MaterialDocument[]> {
  return MaterialModel.find().sort({ sortOrder: 1, code: 1 });
}

/** Materials plus their categories (for units and purchase formulas). */
export async function loadMaterialsWithCategories(): Promise<{ materials: MaterialDocument[]; categories: CategoryMap }> {
  const [materials, categories] = await Promise.all([findAllMaterials(), loadCategoryMap()]);
  return { materials, categories };
}

export async function listMaterials(): Promise<MaterialDto[]> {
  const { materials, categories } = await loadMaterialsWithCategories();
  return materials.map((m) => toMaterialDto(m, categories));
}

export async function listMaterialColumns(): Promise<MaterialColumnDto[]> {
  const { materials, categories } = await loadMaterialsWithCategories();
  return materials.map((m) => toMaterialColumn(m, categories));
}

export async function createMaterial(input: CreateMaterialInput): Promise<MaterialDto> {
  if (await MaterialModel.exists({ code: input.code })) throw new AppError(409, MATERIAL_MESSAGES.CODE_TAKEN);
  const { category, rules } = await categoryRules(input);
  const last = await MaterialModel.findOne().sort({ sortOrder: -1 });
  const material = await MaterialModel.create({
    code: input.code,
    name: input.name || input.code,
    category,
    sortOrder: last ? last.sortOrder + 1 : 0,
    rules,
  });
  return toMaterialDto(material, await loadCategoryMap());
}

export async function updateMaterial(code: string, input: UpdateMaterialInput): Promise<MaterialDto> {
  const material = await MaterialModel.findOne({ code });
  if (!material) throw new AppError(404, MATERIAL_MESSAGES.NOT_FOUND);
  const { category, rules } = await categoryRules(input);
  // The name is optional: left out = keep it; empty = fall back to the code.
  material.set({ name: input.name === undefined ? material.name : input.name || material.code, category, rules });
  material.markModified('rules');
  await material.save();
  return toMaterialDto(material, await loadCategoryMap());
}

/** Refused while any design uses the material (orders read consumption from designs). */
export async function deleteMaterial(code: string): Promise<void> {
  const material = await MaterialModel.findOne({ code });
  if (!material) throw new AppError(404, MATERIAL_MESSAGES.NOT_FOUND);
  const usedBy = await DesignModel.findOne({ 'components.sizes.consumption.material': code }, { designNo: 1 });
  if (usedBy) throw new AppError(409, MATERIAL_MESSAGES.IN_USE, { designNo: usedBy.designNo });
  await material.deleteOne();
}
