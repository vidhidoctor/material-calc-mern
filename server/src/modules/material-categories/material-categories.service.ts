import type { MaterialCategoryDto } from '@app/shared';
import { validateCategory } from '../../calculation/engine.js';
import { AppError } from '../../lib/app-error.js';
import { MaterialModel } from '../materials/material.model.js';
import { MaterialCategoryModel, type MaterialCategory } from './material-category.model.js';
import type { CreateCategoryInput, UpdateCategoryInput } from './material-categories.validation.js';

export const CATEGORY_MESSAGES = {
  NOT_FOUND: 'Category not found.',
  CODE_TAKEN: 'A category with this code already exists.',
  inUse: (count: number) => `This category is used by ${count} material${count === 1 ? '' : 's'} and cannot be removed.`,
} as const;

function toCategoryDto(category: MaterialCategory, materialCount: number): MaterialCategoryDto {
  return {
    code: category.code,
    name: category.name,
    unit: category.unit,
    sortOrder: category.sortOrder,
    fields: category.fields.map((f) => ({ key: f.key, label: f.label, required: f.required, missingMessage: f.missingMessage ?? null })),
    steps: category.steps.map((s) => ({ key: s.key, label: s.label, formula: s.formula })),
    purchaseStep: category.purchaseStep,
    types: [...(category.types ?? [])],
    materialCount,
  };
}

/** Normalises keys (fields keep their case, step keys and the purchase step are upper-case) and checks the formulas. */
function prepare(input: UpdateCategoryInput): Omit<MaterialCategory, 'code' | 'sortOrder'> {
  const definition = {
    name: input.name,
    unit: input.unit,
    fields: input.fields.map((f) => ({ key: f.key, label: f.label, required: f.required, missingMessage: f.missingMessage || null })),
    steps: input.steps.map((s) => ({ key: s.key.toUpperCase(), label: s.label, formula: s.formula })),
    purchaseStep: input.purchaseStep.toUpperCase(),
    types: input.types,
  };
  const problems = validateCategory({ code: '', ...definition });
  if (problems.length > 0) {
    throw new AppError(400, problems[0]!, problems.map((message) => ({ path: 'body', message })));
  }
  return definition;
}

async function materialCounts(): Promise<Map<string, number>> {
  const rows = await MaterialModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$category', count: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [r._id, r.count]));
}

export async function listCategories(): Promise<MaterialCategoryDto[]> {
  const [categories, counts] = await Promise.all([MaterialCategoryModel.find().sort({ sortOrder: 1, code: 1 }), materialCounts()]);
  return categories.map((c) => toCategoryDto(c, counts.get(c.code) ?? 0));
}

export async function createCategory(input: CreateCategoryInput): Promise<MaterialCategoryDto> {
  if (await MaterialCategoryModel.exists({ code: input.code })) throw new AppError(409, CATEGORY_MESSAGES.CODE_TAKEN);
  const definition = prepare(input);
  const last = await MaterialCategoryModel.findOne().sort({ sortOrder: -1 });
  const category = await MaterialCategoryModel.create({ code: input.code, sortOrder: last ? last.sortOrder + 1 : 0, ...definition });
  return toCategoryDto(category, 0);
}

/** The code cannot change (materials refer to it). */
export async function updateCategory(code: string, input: UpdateCategoryInput): Promise<MaterialCategoryDto> {
  const category = await MaterialCategoryModel.findOne({ code });
  if (!category) throw new AppError(404, CATEGORY_MESSAGES.NOT_FOUND);
  category.set(prepare(input));
  await category.save();
  return toCategoryDto(category, (await materialCounts()).get(code) ?? 0);
}

export async function deleteCategory(code: string): Promise<void> {
  const category = await MaterialCategoryModel.findOne({ code });
  if (!category) throw new AppError(404, CATEGORY_MESSAGES.NOT_FOUND);
  const used = await MaterialModel.countDocuments({ category: code });
  if (used > 0) throw new AppError(409, CATEGORY_MESSAGES.inUse(used));
  await category.deleteOne();
}
