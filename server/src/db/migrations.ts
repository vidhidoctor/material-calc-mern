import { MaterialCategoryModel } from '../modules/material-categories/material-category.model.js';
import { MaterialModel } from '../modules/materials/material.model.js';
import { backfillPartyOrderNos } from '../modules/orders/order.model.js';
import { DEFAULT_CATEGORIES, LEGACY_RULE_FIELDS, legacyRules } from './default-categories.js';

/** Creates the three original categories when missing (later edits by Admin are kept). */
export async function ensureDefaultCategories(): Promise<number> {
  let created = 0;
  for (const category of DEFAULT_CATEGORIES) {
    const result = await MaterialCategoryModel.updateOne(
      { code: category.code },
      {
        $setOnInsert: {
          code: category.code,
          name: category.name,
          unit: category.unit,
          sortOrder: category.sortOrder,
          fields: category.fields.map((f) => ({ ...f, missingMessage: f.missingMessage ?? null })),
          steps: category.steps,
          purchaseStep: category.purchaseStep,
        },
      },
      { upsert: true },
    );
    created += result.upsertedCount;
  }
  return created;
}

/** Materials saved before categories were configurable: move the fixed rule fields into `rules`. */
export async function migrateMaterialRules(): Promise<number> {
  const old = await MaterialModel.collection.find({ rules: { $exists: false } }).toArray();
  for (const material of old) {
    await MaterialModel.collection.updateOne(
      { _id: material._id },
      {
        $set: { rules: legacyRules(material as Record<string, number | null>) },
        $unset: Object.fromEntries(LEGACY_RULE_FIELDS.map((key) => [key, ''])),
      },
    );
  }
  return old.length;
}

/** Safe to run on every start; returns a line per change made. */
export async function runStartupMigrations(): Promise<string[]> {
  const log: string[] = [];
  const categories = await ensureDefaultCategories();
  if (categories > 0) log.push(`Created ${categories} default material categor${categories === 1 ? 'y' : 'ies'}.`);
  const materials = await migrateMaterialRules();
  if (materials > 0) log.push(`Moved conversion rules of ${materials} material(s) to the category format.`);
  const orders = await backfillPartyOrderNos();
  if (orders > 0) log.push(`Numbered ${orders} existing order(s) per design + party.`);
  return log;
}
