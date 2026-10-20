import {
  normalizeType,
  parseTypedKey,
  parseVariantKey,
  sortVariantKeys,
  typedKey,
  typedLabel,
  variantKey,
  type DesignCostDto,
  type MaterialRateDto,
  type OrderCostDto,
  type TypeRateDto,
  type TypeRateTableDto,
} from '@app/shared';
import { convertWithCategory, Decimal, toDecimalString, unitCost, type CompiledCategory } from '../../calculation/engine.js';
import { AppError } from '../../lib/app-error.js';
import { consumptionLookup, findDesign, selectedColumns } from '../designs/designs.service.js';
import { DesignModel } from '../designs/design.model.js';
import { compileCategories, loadMaterialsWithCategories, type CategoryMap } from '../materials/materials.service.js';
import type { MaterialDocument } from '../materials/material.model.js';
import { denierFieldKey, orderCords, rulesForOrder } from '../orders/order-cords.js';
import { OrderModel } from '../orders/order.model.js';
import { MaterialRateModel, type MaterialRate } from './material-rate.model.js';
import type { SetRateInput } from './costing.validation.js';

export const COSTING_MESSAGES = {
  unknownMaterial: (code: string) => `Unknown material ${code}.`,
  noRate: (key: string) => `${typedLabel(key)}: no rate set (Material Master → Rates & costs).`,
  typeNotChosen: (key: string, category: string) => `${typedLabel(key)}: the ${category} type is chosen per order, so its cost is shown on orders.`,
  unknownCategory: (code: string) => `Unknown category ${code}.`,
  unknownType: (category: string, type: string) => `${type} is not a ${category} type.`,
  orderNotFound: (orderNo: number) => `Order #${orderNo} not found.`,
  cordPerOrder: (category: string) => `${category}: cost is entered on each order (denier and rate per KG).`,
  cordMissing: (key: string) => `${typedLabel(key)}: enter the denier and rate per KG for this order.`,
} as const;

/** Unit costs keep 10 decimals in transport (bead costs are fractions of a rupee). */
const COST_PLACES = 10;

interface CostContext {
  materials: Map<string, MaterialDocument>;
  categories: CategoryMap;
  compiled: Map<string, CompiledCategory | null>;
  rates: Map<string, MaterialRate>;
}

async function loadContext(): Promise<CostContext> {
  const [{ materials, categories }, rates] = await Promise.all([loadMaterialsWithCategories(), MaterialRateModel.find()]);
  return {
    materials: new Map(materials.map((m) => [m.code, m])),
    categories,
    compiled: compileCategories(categories),
    rates: new Map(rates.map((r) => [r.key, r])),
  };
}

/** Rate key of a category type, e.g. "@SEQUENCE^MATT". */
export const typeRateKey = (category: string, type: string) => `@${category}^${normalizeType(type)}`;

/** A colour uses its own rate when set, otherwise its material's rate. */
function rateFor(ctx: CostContext, key: string): { rate: MaterialRate | null; inherited: boolean } {
  const own = ctx.rates.get(key);
  if (own) return { rate: own, inherited: false };
  const { code, color } = parseVariantKey(key);
  if (color === null) return { rate: null, inherited: false };
  const base = ctx.rates.get(code) ?? null;
  return { rate: base, inherited: base !== null };
}

/** Current cost of one consumption unit for a column key, or an error. */
function currentUnitCost(ctx: CostContext, key: string): { perUnit: Decimal | null; rateInclGst: Decimal | null; error?: string } {
  const { code, columnKey, type } = parseTypedKey(key);
  const material = ctx.materials.get(code);
  if (!material) return { perUnit: null, rateInclGst: null, error: COSTING_MESSAGES.unknownMaterial(code) };
  const materialCategory = ctx.categories.get(material.category);
  if (denierFieldKey(materialCategory)) {
    return { perUnit: null, rateInclGst: null, error: COSTING_MESSAGES.cordPerOrder(materialCategory!.name) };
  }
  // Typed categories (e.g. sequence finish): the rate comes from the type chosen in the order.
  let rate: MaterialRate | null;
  if ((materialCategory?.types?.length ?? 0) > 0) {
    if (!type) return { perUnit: null, rateInclGst: null, error: COSTING_MESSAGES.typeNotChosen(columnKey, materialCategory!.name) };
    rate = ctx.rates.get(typeRateKey(material.category, type)) ?? null;
  } else {
    rate = rateFor(ctx, columnKey).rate;
  }
  if (!rate) return { perUnit: null, rateInclGst: null, error: COSTING_MESSAGES.noRate(key) };
  const category = ctx.compiled.get(material.category) ?? null;
  if (!category) return { perUnit: null, rateInclGst: null, error: 'Material category is not configured.' };
  const result = unitCost(category, material.rules ?? {}, rate.basicRate, rate.gstPercent);
  return { perUnit: result.perUnit, rateInclGst: result.rateInclGst, ...(result.error ? { error: result.error } : {}) };
}

/** Cost of one consumption unit from a rate per purchase unit, with the material's current conversion. */
function perUnitFromRate(ctx: CostContext, key: string, rateInclGst: Decimal): { perUnit: Decimal | null; error?: string } {
  const material = ctx.materials.get(parseTypedKey(key).code);
  const category = material ? (ctx.compiled.get(material.category) ?? null) : null;
  if (!material || !category) return { perUnit: null, error: 'Material category is not configured.' };
  const one = convertWithCategory(category, material.rules ?? {}, new Decimal(1));
  if (!one.purchase) return { perUnit: null, ...(one.error ? { error: one.error } : {}) };
  return { perUnit: one.purchase.times(rateInclGst) };
}

/** Today's rate per purchase unit incl. GST for the given cost keys (saved with a new order). */
export async function currentUnitRates(keys: Iterable<string>): Promise<Record<string, string>> {
  const ctx = await loadContext();
  const rates: Record<string, string> = {};
  for (const key of new Set(keys)) {
    const { rateInclGst, perUnit } = currentUnitCost(ctx, key);
    if (rateInclGst && perUnit) rates[key] = toDecimalString(rateInclGst, COST_PLACES);
  }
  return rates;
}

export interface OrderUnitCost {
  perUnit: Decimal | null;
  /** Rate per purchase unit incl. GST used (null for older orders that saved only a unit cost). */
  rateInclGst: Decimal | null;
  /** True when no rate was saved with the order and today's rate was used. */
  current: boolean;
  error?: string;
}

/** Unit costs of an order: its saved rates (or older saved unit costs), else today's rates. */
export async function orderUnitCosts(order: { unitRates?: Record<string, string>; unitCosts?: Record<string, string> }): Promise<(key: string) => OrderUnitCost> {
  const ctx = await loadContext();
  const rates = order.unitRates ?? {};
  const legacy = order.unitCosts ?? {};
  return (key) => {
    if (rates[key] !== undefined) {
      const rateInclGst = new Decimal(rates[key]!);
      return { ...perUnitFromRate(ctx, key, rateInclGst), rateInclGst, current: false };
    }
    if (legacy[key] !== undefined) return { perUnit: new Decimal(legacy[key]!), rateInclGst: null, current: false };
    const now = currentUnitCost(ctx, key);
    return { perUnit: now.perUnit, rateInclGst: now.rateInclGst, current: true, ...(now.error ? { error: now.error } : {}) };
  };
}

/** Current unit costs for the given column keys. */
export async function currentUnitCosts(keys: Iterable<string>): Promise<Record<string, string>> {
  const ctx = await loadContext();
  const costs: Record<string, string> = {};
  for (const key of new Set(keys)) {
    const { perUnit } = currentUnitCost(ctx, key);
    if (perUnit) costs[key] = toDecimalString(perUnit, COST_PLACES);
  }
  return costs;
}

/** Every material, plus every colour used in a design (so a colour-specific rate can be set). */
export async function listRates(): Promise<MaterialRateDto[]> {
  const [ctx, designs] = await Promise.all([loadContext(), DesignModel.find({}, { components: 1 })]);
  const colourKeys = designs.flatMap((d) => d.components.flatMap((c) => selectedColumns(c))).filter((k) => parseVariantKey(k).color);
  const rateKeys = [...ctx.rates.keys()];
  const order = [...ctx.materials.keys()];
  // Typed materials are priced per type; cords on each order: neither has a rate here.
  const typedCodes = new Set(
    [...ctx.materials.values()]
      .filter((m) => (ctx.categories.get(m.category)?.types?.length ?? 0) > 0 || denierFieldKey(ctx.categories.get(m.category)) !== null)
      .map((m) => m.code),
  );
  const keys = sortVariantKeys([...order, ...colourKeys, ...rateKeys.filter((k) => !k.startsWith('@'))], order).filter(
    (k) => ctx.materials.has(parseVariantKey(k).code) && !typedCodes.has(parseVariantKey(k).code),
  );

  return keys.map((key) => {
    const { code, color } = parseVariantKey(key);
    const material = ctx.materials.get(code)!;
    const category = ctx.categories.get(material.category);
    const step = category?.steps.find((s) => s.key === category.purchaseStep);
    const { rate, inherited } = rateFor(ctx, key);
    const cost = currentUnitCost(ctx, key);
    return {
      key,
      code,
      color,
      category: material.category,
      fields: (category?.fields ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        required: f.required,
        value: typeof material.rules?.[f.key] === 'number' ? material.rules[f.key]! : null,
      })),
      unit: category?.unit ?? '',
      purchaseUnit: step?.label ?? category?.purchaseStep ?? '',
      basicRate: rate?.basicRate ?? null,
      gstPercent: rate?.gstPercent ?? null,
      inherited,
      rateInclGst: cost.rateInclGst ? toDecimalString(cost.rateInclGst, COST_PLACES) : null,
      costPerUnit: cost.perUnit ? toDecimalString(cost.perUnit, COST_PLACES) : null,
      ...(rate && cost.error ? { error: cost.error } : {}),
    };
  });
}

export async function setRate(rawKey: string, input: SetRateInput, actorEmail: string): Promise<MaterialRateDto[]> {
  const { code, color } = parseVariantKey(rawKey);
  const ctx = await loadContext();
  if (!ctx.materials.has(code)) throw new AppError(404, COSTING_MESSAGES.unknownMaterial(code));
  await MaterialRateModel.updateOne(
    { key: variantKey(code, color) },
    { $set: { basicRate: input.basicRate, gstPercent: input.gstPercent, updatedAt: new Date(), updatedBy: actorEmail } },
    { upsert: true },
  );
  return listRates();
}

/** Removes a rate (a colour then falls back to its material's rate). */
export async function deleteRate(rawKey: string): Promise<MaterialRateDto[]> {
  const { code, color } = parseVariantKey(rawKey);
  await MaterialRateModel.deleteOne({ key: variantKey(code, color) });
  return listRates();
}

/** Cost per piece of every size of every component, at today's rates. */
export async function designCost(designNo: string): Promise<DesignCostDto> {
  const [design, ctx] = await Promise.all([findDesign(designNo), loadContext()]);
  const lookup = consumptionLookup(design);
  const unitCosts: Record<string, string | null> = {};
  const errors = new Set<string>();
  const perUnit = (key: string) => {
    if (!(key in unitCosts)) {
      const cost = currentUnitCost(ctx, key);
      unitCosts[key] = cost.perUnit ? toDecimalString(cost.perUnit, COST_PLACES) : null;
      if (cost.error) {
        // Typed materials (e.g. sequence) have no type in a design: one short note per category instead of one per colour.
        const material = ctx.materials.get(parseVariantKey(key).code);
        const category = ctx.categories.get(material?.category ?? '');
        errors.add((category?.types?.length ?? 0) > 0 ? `${category!.name}: cost depends on the type chosen per order (see each order).` : cost.error);
      }
    }
    return unitCosts[key] === null ? null : new Decimal(unitCosts[key]!);
  };

  const components = design.components.map((component) => ({
    name: component.name,
    sizes: component.sizes.map((s) => {
      const consumption = lookup(component.name, s.size) ?? {};
      const costs: Record<string, string> = {};
      let total = new Decimal(0);
      for (const [key, qty] of Object.entries(consumption)) {
        const unit = perUnit(key);
        if (!unit) continue;
        const cost = unit.times(qty);
        costs[key] = toDecimalString(cost);
        total = total.plus(cost);
      }
      return { size: s.size, costs, total: toDecimalString(total) };
    }),
  }));
  return { designNo: design.designNo, unitCosts, components, errors: [...errors] };
}

/** Order cost with the rates saved when it was created; today's rate only where none was saved. */
export async function orderCost(orderNo: number): Promise<OrderCostDto> {
  const order = await OrderModel.findOne({ orderNo });
  if (!order) throw new AppError(404, COSTING_MESSAGES.orderNotFound(orderNo));
  const [design, ctx] = await Promise.all([DesignModel.findOne({ designNo: order.designNo }), loadContext()]);
  const lookup = consumptionLookup(design);
  const resolve = await orderUnitCosts(order);
  const types = order.types ?? {};
  const isTyped = (key: string) => {
    const material = ctx.materials.get(parseVariantKey(key).code);
    return (ctx.categories.get(material?.category ?? '')?.types?.length ?? 0) > 0;
  };
  const costKey = (key: string) => (isTyped(key) ? typedKey(key, types[key] ?? null) : key);
  const errors = new Set<string>();
  let usesCurrentRates = false;
  const cords = orderCords(order);

  /** Cord: ₹ per metre = KG in one metre (order denier) × rate per KG entered on the order. */
  const cordUnit = (key: string): Decimal | null | undefined => {
    const material = ctx.materials.get(parseVariantKey(key).code);
    const denierField = denierFieldKey(ctx.categories.get(material?.category ?? ''));
    if (!material || !denierField) return undefined;
    const cord = cords.get(key);
    const category = ctx.compiled.get(material.category) ?? null;
    const one = category && cord?.denier ? convertWithCategory(category, rulesForOrder(material.rules ?? {}, denierField, cord.denier), new Decimal(1)).purchase : null;
    if (!one || cord?.ratePerUnit == null) {
      errors.add(COSTING_MESSAGES.cordMissing(key));
      return null;
    }
    return one.times(cord.ratePerUnit);
  };

  const unit = (key: string): Decimal | null => {
    const cordCost = cordUnit(key);
    if (cordCost !== undefined) return cordCost;
    const cost = resolve(key);
    if (cost.current) usesCurrentRates = true;
    if (cost.error) errors.add(cost.error);
    return cost.perUnit;
  };

  let total = new Decimal(0);
  let pieces = 0;
  const rows = order.lines.map(({ component, size, quantity }) => {
    const consumption = lookup(component, size);
    let cost = new Decimal(0);
    for (const [key, qty] of Object.entries(consumption ?? {})) {
      const perUnit = unit(costKey(key));
      if (perUnit) cost = cost.plus(perUnit.times(qty).times(quantity));
    }
    total = total.plus(cost);
    pieces += quantity;
    return { component, size, quantity, cost };
  });

  const byComponent = new Map<string, { quantity: number; cost: Decimal }>();
  for (const row of rows) {
    const group = byComponent.get(row.component) ?? { quantity: 0, cost: new Decimal(0) };
    group.quantity += row.quantity;
    group.cost = group.cost.plus(row.cost);
    byComponent.set(row.component, group);
  }

  return {
    orderNo: order.orderNo,
    total: toDecimalString(total),
    perPiece: toDecimalString(pieces > 0 ? total.dividedBy(pieces) : new Decimal(0)),
    components: [...byComponent].map(([component, g]) => ({ component, quantity: g.quantity, cost: toDecimalString(g.cost) })),
    rows: rows.map((r) => ({ ...r, cost: toDecimalString(r.cost) })),
    usesCurrentRates,
    errors: [...errors],
  };
}

/** Rates of every type of every typed category, with the resulting cost per unit of each material (like the rate sheet). */
export async function listTypeRates(): Promise<TypeRateDto[]> {
  const ctx = await loadContext();
  const rows: TypeRateDto[] = [];
  const categories = [...ctx.categories.values()].filter((c) => (c.types?.length ?? 0) > 0).sort((a, b) => a.sortOrder - b.sortOrder);
  for (const category of categories) {
    const step = category.steps.find((st) => st.key === category.purchaseStep);
    const members = [...ctx.materials.values()].filter((m) => m.category === category.code);
    for (const type of category.types) {
      const rate = ctx.rates.get(typeRateKey(category.code, type)) ?? null;
      const compiled = ctx.compiled.get(category.code) ?? null;
      const perMaterial = members.map((m) => {
        if (!rate || !compiled) return { code: m.code, costPerUnit: null };
        const cost = unitCost(compiled, m.rules ?? {}, rate.basicRate, rate.gstPercent);
        return { code: m.code, costPerUnit: cost.perUnit ? toDecimalString(cost.perUnit, COST_PLACES) : null };
      });
      rows.push({
        category: category.code,
        categoryName: category.name,
        type,
        purchaseUnit: step?.label ?? category.purchaseStep,
        unit: category.unit,
        basicRate: rate?.basicRate ?? null,
        gstPercent: rate?.gstPercent ?? null,
        rateInclGst: rate ? toDecimalString(new Decimal(rate.basicRate).times(new Decimal(rate.gstPercent).dividedBy(100).plus(1)), COST_PLACES) : null,
        perMaterial,
      });
    }
  }
  return rows;
}

export async function setTypeRate(category: string, type: string, input: SetRateInput, actorEmail: string): Promise<TypeRateDto[]> {
  const ctx = await loadContext();
  const found = ctx.categories.get(category);
  if (!found) throw new AppError(404, COSTING_MESSAGES.unknownCategory(category));
  const name = normalizeType(type) ?? '';
  if (!found.types.includes(name)) throw new AppError(404, COSTING_MESSAGES.unknownType(found.name, name));
  await MaterialRateModel.updateOne(
    { key: typeRateKey(category, name) },
    { $set: { basicRate: input.basicRate, gstPercent: input.gstPercent, updatedAt: new Date(), updatedBy: actorEmail } },
    { upsert: true },
  );
  return listTypeRates();
}

/**
 * The rate table of every typed category (e.g. Sequence): sizes × types. Each cell has the cost per
 * consumption unit (one sequence) and per unit of every other step (e.g. per CD = rate ÷ CD per roll),
 * worked out from the category formula: cost per step unit = cost per piece ÷ step value for one piece.
 */
export async function listTypeRateTables(): Promise<TypeRateTableDto[]> {
  const ctx = await loadContext();
  const tables: TypeRateTableDto[] = [];
  const categories = [...ctx.categories.values()].filter((c) => (c.types?.length ?? 0) > 0).sort((a, b) => a.sortOrder - b.sortOrder);
  for (const category of categories) {
    const compiled = ctx.compiled.get(category.code) ?? null;
    const purchase = category.steps.find((st) => st.key === category.purchaseStep);
    const types = category.types.map((type) => {
      const rate = ctx.rates.get(typeRateKey(category.code, type)) ?? null;
      return {
        type,
        rate,
        dto: {
          type,
          basicRate: rate?.basicRate ?? null,
          gstPercent: rate?.gstPercent ?? null,
          rateInclGst: rate ? toDecimalString(new Decimal(rate.basicRate).times(new Decimal(rate.gstPercent).dividedBy(100).plus(1)), COST_PLACES) : null,
        },
      };
    });
    const materials = [...ctx.materials.values()]
      .filter((m) => m.category === category.code)
      .map((m) => {
        const rules = { ...(m.rules ?? {}) };
        const perPiece = compiled ? convertWithCategory(compiled, rules, new Decimal(1)) : null;
        const costs: TypeRateTableDto['materials'][number]['costs'] = {};
        for (const { type, rate } of types) {
          if (!rate || !compiled) {
            costs[type] = { perUnit: null, perStep: {} };
            continue;
          }
          const cost = unitCost(compiled, rules, rate.basicRate, rate.gstPercent);
          const perStep: Record<string, string> = {};
          if (cost.perUnit && perPiece?.values) {
            for (const step of category.steps) {
              const value = perPiece.values.get(step.key);
              if (step.key !== category.purchaseStep && value && !value.isZero()) {
                perStep[step.key] = toDecimalString(cost.perUnit.dividedBy(value), COST_PLACES);
              }
            }
          }
          costs[type] = { perUnit: cost.perUnit ? toDecimalString(cost.perUnit, COST_PLACES) : null, perStep };
        }
        return { code: m.code, rules, costs };
      });
    tables.push({
      category: category.code,
      categoryName: category.name,
      unit: category.unit,
      purchaseUnit: purchase?.label ?? category.purchaseStep,
      fields: category.fields.map((f) => ({ key: f.key, label: f.label, required: f.required })),
      steps: category.steps.filter((st) => st.key !== category.purchaseStep).map((st) => ({ key: st.key, label: st.label })),
      types: types.map((x) => x.dto),
      materials,
    });
  }
  return tables;
}

/**
 * Explicit, authorised re-pricing of one order with today's rates (orders otherwise keep the rates
 * saved when they were created).
 */
export async function refreshOrderRates(orderNo: number): Promise<OrderCostDto> {
  const order = await OrderModel.findOne({ orderNo });
  if (!order) throw new AppError(404, COSTING_MESSAGES.orderNotFound(orderNo));
  const [design, ctx] = await Promise.all([DesignModel.findOne({ designNo: order.designNo }), loadContext()]);
  const lookup = consumptionLookup(design);
  const types = order.types ?? {};
  const isTyped = (key: string) => (ctx.categories.get(ctx.materials.get(parseVariantKey(key).code)?.category ?? '')?.types?.length ?? 0) > 0;
  const keys = order.lines.flatMap(({ component, size }) =>
    Object.keys(lookup(component, size) ?? {}).map((key) => (isTyped(key) ? typedKey(key, types[key] ?? null) : key)),
  );
  order.unitRates = await currentUnitRates(keys);
  order.unitCosts = undefined;
  order.markModified('unitRates');
  order.markModified('unitCosts');
  await order.save();
  return orderCost(orderNo);
}
