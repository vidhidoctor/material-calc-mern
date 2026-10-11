import {
  parseVariantKey,
  sortVariantKeys,
  variantKey,
  type DesignCostDto,
  type MaterialRateDto,
  type OrderCostDto,
} from '@app/shared';
import { Decimal, toDecimalString, unitCost, type CompiledCategory } from '../../calculation/engine.js';
import { AppError } from '../../lib/app-error.js';
import { consumptionLookup, findDesign, selectedColumns } from '../designs/designs.service.js';
import { DesignModel } from '../designs/design.model.js';
import { compileCategories, loadMaterialsWithCategories, type CategoryMap } from '../materials/materials.service.js';
import type { MaterialDocument } from '../materials/material.model.js';
import { OrderModel } from '../orders/order.model.js';
import { MaterialRateModel, type MaterialRate } from './material-rate.model.js';
import type { SetRateInput } from './costing.validation.js';

export const COSTING_MESSAGES = {
  unknownMaterial: (code: string) => `Unknown material ${code}.`,
  noRate: (key: string) => `${key.replace('|', ' · ')}: no rate set (Material Master → Rates & costs).`,
  orderNotFound: (orderNo: number) => `Order #${orderNo} not found.`,
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
  const { code } = parseVariantKey(key);
  const material = ctx.materials.get(code);
  if (!material) return { perUnit: null, rateInclGst: null, error: COSTING_MESSAGES.unknownMaterial(code) };
  const { rate } = rateFor(ctx, key);
  if (!rate) return { perUnit: null, rateInclGst: null, error: COSTING_MESSAGES.noRate(key) };
  const category = ctx.compiled.get(material.category) ?? null;
  if (!category) return { perUnit: null, rateInclGst: null, error: 'Material category is not configured.' };
  const result = unitCost(category, material.rules ?? {}, rate.basicRate, rate.gstPercent);
  return { perUnit: result.perUnit, rateInclGst: result.rateInclGst, ...(result.error ? { error: result.error } : {}) };
}

/** Current unit costs for the given column keys (used to save rates with a new order). */
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
  const keys = sortVariantKeys([...order, ...colourKeys, ...rateKeys], order).filter((k) => ctx.materials.has(parseVariantKey(k).code));

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
      if (cost.error) errors.add(cost.error);
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
  const saved: Record<string, string> = order.unitCosts ?? {};
  const errors = new Set<string>();
  let usesCurrentRates = false;

  const unit = (key: string): Decimal | null => {
    if (saved[key] !== undefined) return new Decimal(saved[key]!);
    usesCurrentRates = true;
    const current = currentUnitCost(ctx, key);
    if (current.error) errors.add(current.error);
    return current.perUnit;
  };

  let total = new Decimal(0);
  let pieces = 0;
  const rows = order.lines.map(({ component, size, quantity }) => {
    const consumption = lookup(component, size);
    let cost = new Decimal(0);
    for (const [key, qty] of Object.entries(consumption ?? {})) {
      const perUnit = unit(key);
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
