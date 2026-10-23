import { ADMIN_ROLE, isOrderEnteredField, parseVariantKey, PERMISSION_CODES } from '@app/shared';
import { MaterialRateModel } from '../modules/costing/material-rate.model.js';
import { RoleModel } from '../modules/roles/role.model.js';
import { MaterialCategoryModel } from '../modules/material-categories/material-category.model.js';
import { MaterialModel } from '../modules/materials/material.model.js';
import { Decimal } from '../calculation/engine.js';
import { seedComponentNames } from '../modules/component-names/component-names.service.js';
import { DesignModel } from '../modules/designs/design.model.js';
import { consumptionLookup } from '../modules/designs/designs.service.js';
import { backfillPartyOrderNos, OrderModel } from '../modules/orders/order.model.js';
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
          orderStep: category.orderStep,
          wholeUnits: category.wholeUnits,
        },
      },
      { upsert: true },
    );
    created += result.upsertedCount;
  }
  return created;
}

/**
 * Categories saved before orders showed purchase units: the default categories get their order unit
 * (sequences in whole CDs, when the category still has a CD step); others show the purchase step.
 */
export async function migrateOrderUnits(): Promise<number> {
  const old = await MaterialCategoryModel.collection.find({ orderStep: { $exists: false } }).toArray();
  for (const category of old) {
    const preset = DEFAULT_CATEGORIES.find((c) => c.code === category.code);
    const steps = (category.steps ?? []) as { key: string }[];
    const usable = preset?.orderStep && steps.some((s) => s.key === preset.orderStep);
    await MaterialCategoryModel.collection.updateOne(
      { _id: category._id },
      { $set: { orderStep: usable ? preset.orderStep : null, wholeUnits: usable ? preset.wholeUnits : false } },
    );
  }
  return old.length;
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

/**
 * Before cord values leave Material Master: every existing order that uses a cord and has never had
 * cord values of its own gets them copied — the Material Master denier and the rate saved with the order
 * (else today's Material Master rate incl. GST) — so its weight and cost stay exactly as they were.
 * Orders whose cord values were already saved (even cleared) are left alone. Safe to run on every start.
 */
export async function copyCordValuesToOrders(): Promise<number> {
  const categories = await MaterialCategoryModel.find({}, { code: 1, fields: 1 });
  const cordCategories = new Set(categories.filter((c) => c.fields.some((f) => isOrderEnteredField(f.key))).map((c) => c.code));
  if (cordCategories.size === 0) return 0;
  const cords = await MaterialModel.collection.find({ category: { $in: [...cordCategories] } }).toArray();
  if (cords.length === 0) return 0;
  const denierOf = new Map(
    cords.map((c) => {
      const entry = Object.entries((c.rules ?? {}) as Record<string, unknown>).find(([key]) => isOrderEnteredField(key));
      return [c.code as string, typeof entry?.[1] === 'number' && entry[1] > 0 ? entry[1] : null] as const;
    }),
  );
  const rates = new Map((await MaterialRateModel.find()).map((r) => [r.key, r]));
  const masterRate = (key: string): number | null => {
    const rate = rates.get(key) ?? rates.get(parseVariantKey(key).code);
    return rate ? new Decimal(rate.basicRate).times(new Decimal(rate.gstPercent).dividedBy(100).plus(1)).toNumber() : null;
  };

  const orders = await OrderModel.find({ cords: { $exists: false } });
  if (orders.length === 0) return 0;
  const designs = new Map((await DesignModel.find({ designNo: { $in: [...new Set(orders.map((o) => o.designNo))] } })).map((d) => [d.designNo, consumptionLookup(d)]));
  let changed = 0;
  for (const order of orders) {
    const lookup = designs.get(order.designNo);
    if (!lookup) continue;
    const keys = new Set(
      order.lines.flatMap((l) => Object.keys(lookup(l.component, l.size) ?? {})).filter((key) => denierOf.has(parseVariantKey(key).code)),
    );
    const values = [...keys].flatMap((key) => {
      const denier = denierOf.get(parseVariantKey(key).code) ?? null;
      const saved = order.unitRates?.[key];
      const ratePerUnit = saved !== undefined ? Number(saved) : masterRate(key);
      return denier === null && ratePerUnit === null ? [] : [{ key, denier, ratePerUnit }];
    });
    if (values.length === 0) continue;
    order.cords = values;
    await order.save();
    changed++;
  }
  return changed;
}

/**
 * Cords are configured on each order (denier, rate per KG incl. GST): Material Master keeps only the
 * cord material itself, so earlier deniers and cord rates are removed. Safe to run on every start.
 */
export async function removeCordMasterValues(): Promise<number> {
  const cordCategories = await MaterialCategoryModel.find({}, { code: 1, fields: 1 });
  const fields = new Map(
    cordCategories.flatMap((c) => {
      const field = c.fields.find((f) => isOrderEnteredField(f.key));
      return field ? [[c.code, field.key] as const] : [];
    }),
  );
  if (fields.size === 0) return 0;
  const cords = await MaterialModel.collection.find({ category: { $in: [...fields.keys()] } }).toArray();
  let changed = 0;
  for (const cord of cords) {
    const field = fields.get(cord.category as string)!;
    const rules = (cord.rules ?? {}) as Record<string, unknown>;
    const stored = Object.keys(rules).filter((k) => isOrderEnteredField(k) || k === field);
    if (stored.length > 0) {
      await MaterialModel.collection.updateOne({ _id: cord._id }, { $unset: Object.fromEntries(stored.map((k) => [`rules.${k}`, ''])) });
      changed++;
    }
  }
  const codes = new Set(cords.map((c) => c.code as string));
  const rateKeys = (await MaterialRateModel.find({}, { key: 1 })).map((r) => r.key).filter((key) => codes.has(parseVariantKey(key).code));
  if (rateKeys.length > 0) {
    await MaterialRateModel.deleteMany({ key: { $in: rateKeys } });
    changed += rateKeys.length;
  }
  return changed;
}

/** Admin always holds every permission, including ones added in later versions (e.g. COST_VIEW). */
export async function grantAdminAllPermissions(): Promise<number> {
  const result = await RoleModel.updateOne({ name: ADMIN_ROLE }, { $addToSet: { permissions: { $each: [...PERMISSION_CODES] } } });
  return result.modifiedCount;
}

/** Safe to run on every start; returns a line per change made. */
export async function runStartupMigrations(): Promise<string[]> {
  const log: string[] = [];
  if ((await grantAdminAllPermissions()) > 0) log.push('Admin role: new permissions granted.');
  const categories = await ensureDefaultCategories();
  if (categories > 0) log.push(`Created ${categories} default material categor${categories === 1 ? 'y' : 'ies'}.`);
  const units = await migrateOrderUnits();
  if (units > 0) log.push(`Set the order unit of ${units} material categor${units === 1 ? 'y' : 'ies'}.`);
  const materials = await migrateMaterialRules();
  // Copy first, so existing orders keep their cord weight and cost; then clear Material Master.
  const copied = await copyCordValuesToOrders();
  if (copied > 0) log.push(`Cords: copied denier and rate onto ${copied} existing order(s).`);
  const cordValues = await removeCordMasterValues();
  if (cordValues > 0) log.push(`Cords: removed ${cordValues} denier/rate value(s) from Material Master (entered on each order now).`);
  if (materials > 0) log.push(`Moved conversion rules of ${materials} material(s) to the category format.`);
  const componentNames = await seedComponentNames();
  if (componentNames > 0) log.push(`Component list: added ${componentNames} name(s) for Punching.`);
  const orders = await backfillPartyOrderNos();
  if (orders > 0) log.push(`Numbered ${orders} existing order(s) per design + party.`);
  return log;
}
