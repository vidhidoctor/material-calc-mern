import type { PurchaseCategoryDto, PurchaseRequirementDto, PurchaseTotalDto } from '@app/shared';
import {
  calculateRequirements,
  compileCategory,
  convertWithCategory,
  toDecimalString,
  type CalcLine,
  type CompiledCategory,
} from '../../calculation/engine.js';
import { consumptionLookup } from '../designs/designs.service.js';
import { DesignModel } from '../designs/design.model.js';
import { loadMaterialsWithCategories, toMaterialColumn } from '../materials/materials.service.js';
import { OrderModel, orderLabel } from '../orders/order.model.js';
import { findOrder } from '../orders/orders.service.js';
import type { PurchaseQuery } from './purchase.validation.js';

const CATEGORY_MISSING = 'Material category is not configured.';

/**
 * One order (any status) when orderNo is given, otherwise every order except CANCELLED.
 * Consumption always comes from the design's current values (§8); purchase quantities come from
 * each material category's formula steps.
 */
export async function getPurchaseRequirements({ orderNo, components }: PurchaseQuery): Promise<PurchaseRequirementDto> {
  const orders = orderNo !== undefined
    ? [await findOrder(orderNo)]
    : await OrderModel.find({ status: { $ne: 'CANCELLED' } }).sort({ orderNo: 1 });

  const designNos = [...new Set(orders.map((o) => o.designNo))];
  const [designs, { materials, categories }] = await Promise.all([
    DesignModel.find({ designNo: { $in: designNos } }),
    loadMaterialsWithCategories(),
  ]);
  const lookups = new Map(designs.map((d) => [d.designNo, consumptionLookup(d)]));
  const missingDesign = consumptionLookup(null);

  const wanted = new Set(components);
  const lines: CalcLine[] = orders.flatMap((order) => {
    const lookup = lookups.get(order.designNo) ?? missingDesign;
    return order.lines
      .filter((line) => wanted.size === 0 || wanted.has(line.component))
      .map(({ component, size, quantity }) => ({
        component,
        size,
        quantity,
        consumption: lookup(component, size),
        label: `${orderLabel(order)} ${component} ${size}`,
      }));
  });

  // Categories are validated when saved; a broken one is reported per material, never thrown.
  const compiled = new Map<string, CompiledCategory | null>();
  for (const [code, category] of categories) {
    try {
      compiled.set(
        code,
        compileCategory({
          code: category.code,
          name: category.name,
          fields: category.fields.map((f) => ({ key: f.key, label: f.label, required: f.required, missingMessage: f.missingMessage })),
          steps: category.steps.map((s) => ({ key: s.key, label: s.label, formula: s.formula })),
          purchaseStep: category.purchaseStep,
        }),
      );
    } catch {
      compiled.set(code, null);
    }
  }

  const result = calculateRequirements(lines, materials.map((m) => m.code));
  const errors = [...result.errors];
  const totals: PurchaseTotalDto[] = materials.map((material) => {
    const total = result.totals.get(material.code)!;
    const category = compiled.get(material.category) ?? null;
    const conversion = category
      ? convertWithCategory(category, material.rules ?? {}, total)
      : { values: null, purchase: null, error: CATEGORY_MISSING };
    if (conversion.error && !total.isZero()) errors.push(`${material.code}: ${conversion.error}`);
    return {
      ...toMaterialColumn(material, categories),
      total: toDecimalString(total),
      rules: { ...(material.rules ?? {}) },
      values: conversion.values ? Object.fromEntries([...conversion.values].map(([k, v]) => [k, toDecimalString(v)])) : null,
      purchase: conversion.purchase ? toDecimalString(conversion.purchase) : null,
      ...(conversion.error ? { error: conversion.error } : {}),
    };
  });

  const categoryList: PurchaseCategoryDto[] = [...categories.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((c) => ({
      code: c.code,
      name: c.name,
      unit: c.unit,
      fields: c.fields.map((f) => ({ key: f.key, label: f.label })),
      steps: c.steps.map((s) => ({ key: s.key, label: s.label, formula: s.formula })),
      purchaseStep: c.purchaseStep,
    }));

  return { orderNos: orders.map((o) => o.orderNo), components, categories: categoryList, totals, errors };
}
