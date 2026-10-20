import {
  parseTypedKey,
  parseVariantKey,
  sortVariantKeys,
  typedKey,
  typedLabel,
  type PurchaseCategoryDto,
  type PurchaseRequirementDto,
  type PurchaseTotalDto,
} from '@app/shared';
import {
  calculateRequirements,
  convertWithCategory,
  Decimal,
  toDecimalString,
  type CalcLine,
  type ConversionResult,
} from '../../calculation/engine.js';
import { consumptionLookup } from '../designs/designs.service.js';
import { DesignModel } from '../designs/design.model.js';
import { compileCategories, loadMaterialsWithCategories, toMaterialColumn } from '../materials/materials.service.js';
import { denierFieldKey, orderCords, rulesForOrder } from '../orders/order-cords.js';
import { OrderModel, orderLabel, type OrderDocument } from '../orders/order.model.js';
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

  const typedCodes = new Set(materials.filter((m) => (categories.get(m.category)?.types?.length ?? 0) > 0).map((m) => m.code));
  /** Consumption with typed columns renamed to the order's chosen type (bought and priced per type). */
  const withTypes = (consumption: Record<string, number> | null, types: Record<string, string>) =>
    consumption === null
      ? null
      : Object.fromEntries(
          Object.entries(consumption).map(([key, qty]) => [typedCodes.has(parseVariantKey(key).code) ? typedKey(key, types[key] ?? null) : key, qty]),
        );

  const wanted = new Set(components);
  const lines: CalcLine[] = orders.flatMap((order) => {
    const lookup = lookups.get(order.designNo) ?? missingDesign;
    const types = order.types ?? {};
    return order.lines
      .filter((line) => wanted.size === 0 || wanted.has(line.component))
      .map(({ component, size, quantity }) => ({
        component,
        size,
        quantity,
        consumption: withTypes(lookup(component, size), types),
        label: `${orderLabel(order)} ${component} ${size}`,
      }));
  });

  // Categories are validated when saved; a broken one is reported per material, never thrown.
  const compiled = compileCategories(categories);

  // Every material (plain) plus every colour variant the lines use; colours are bought separately.
  const codes = materials.map((m) => m.code);
  const byCode = new Map(materials.map((m) => [m.code, m]));
  const keys = sortVariantKeys([...codes, ...lines.flatMap((l) => Object.keys(l.consumption ?? {}))], codes).filter((key) =>
    byCode.has(parseTypedKey(key).code),
  );
  const result = calculateRequirements(lines, keys);
  const errors = [...result.errors];

  // Cords: each order's metres are weighed with that order's denier (never Material Master), then summed.
  const cordParts = new Map<string, { order: OrderDocument; total: Decimal }[]>();
  for (const order of orders) {
    const lookup = lookups.get(order.designNo) ?? missingDesign;
    const perKey = new Map<string, Decimal>();
    for (const line of order.lines.filter((l) => wanted.size === 0 || wanted.has(l.component))) {
      for (const [key, qty] of Object.entries(lookup(line.component, line.size) ?? {})) {
        const material = byCode.get(parseVariantKey(key).code);
        if (!material || !denierFieldKey(categories.get(material.category))) continue;
        perKey.set(key, (perKey.get(key) ?? new Decimal(0)).plus(new Decimal(qty).times(line.quantity)));
      }
    }
    for (const [key, total] of perKey) cordParts.set(key, [...(cordParts.get(key) ?? []), { order, total }]);
  }
  const cordConversion = (key: string, field: string, rules: Record<string, number>, category: NonNullable<ReturnType<typeof compiled.get>>): ConversionResult => {
    const parts = (cordParts.get(key) ?? []).filter((p) => !p.total.isZero());
    if (parts.length === 0) return { values: null, purchase: null };
    const missing = parts.filter((p) => !orderCords(p.order).get(key)?.denier);
    if (missing.length > 0) return { values: null, purchase: null, error: `enter the cord denier in order ${missing.map((p) => orderLabel(p.order)).join(', ')}.` };
    const values = new Map<string, Decimal>();
    for (const p of parts) {
      const converted = convertWithCategory(category, rulesForOrder(rules, field, orderCords(p.order).get(key)!.denier), p.total);
      if (!converted.values) return converted;
      for (const [step, value] of converted.values) values.set(step, (values.get(step) ?? new Decimal(0)).plus(value));
    }
    return { values, purchase: values.get(category.purchaseStep.toUpperCase()) ?? null };
  };
  const totals: PurchaseTotalDto[] = keys.map((key) => {
    const { code, color, type } = parseTypedKey(key);
    const material = byCode.get(code)!;
    const total = result.totals.get(key)!;
    const category = compiled.get(material.category) ?? null;
    const denierField = denierFieldKey(categories.get(material.category));
    const rules = rulesForOrder(material.rules ?? {}, denierField, null);
    const conversion: ConversionResult = !category
      ? { values: null, purchase: null, error: CATEGORY_MISSING }
      : denierField
        ? cordConversion(key, denierField, rules, category)
        : convertWithCategory(category, rules, total);
    if (conversion.error && !total.isZero()) errors.push(`${typedLabel(key)}: ${conversion.error}`);
    return {
      ...toMaterialColumn(material, categories),
      key,
      color,
      type,
      total: toDecimalString(total),
      rules: { ...rules },
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
