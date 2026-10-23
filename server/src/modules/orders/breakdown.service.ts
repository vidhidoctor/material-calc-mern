import { parseVariantKey, typedKey, type MaterialBreakdownDto } from '@app/shared';
import { convertWithCategory, Decimal, toDecimalString, type CompiledCategory } from '../../calculation/engine.js';
import { orderUnitCosts } from '../costing/costing.service.js';
import { consumptionLookup, findDesign } from '../designs/designs.service.js';
import { DesignModel } from '../designs/design.model.js';
import { compileCategories, loadMaterialsWithCategories, type CategoryMap } from '../materials/materials.service.js';
import type { MaterialDocument } from '../materials/material.model.js';
import { MESSAGES } from '@app/shared';
import { denierFieldKey, orderCords, rulesForOrder } from './order-cords.js';
import { effectiveLines } from './order-lines.js';
import { findOrder } from './orders.service.js';

/**
 * Per-piece (design) and per-order material detail, e.g. the cording sheet: cord, metres per piece,
 * denier, grams/KG per piece, target pieces, total KG, rate per KG and amount.
 */

const CORD_PER_ORDER = 'Cord weight is worked out on each order (denier entered on the order).';

interface Context {
  materials: Map<string, MaterialDocument>;
  categories: CategoryMap;
  compiled: Map<string, CompiledCategory | null>;
}

async function loadContext(): Promise<Context> {
  const { materials, categories } = await loadMaterialsWithCategories();
  return { materials: new Map(materials.map((m) => [m.code, m])), categories, compiled: compileCategories(categories) };
}

const stringify = (values: Map<string, Decimal> | null): Record<string, string> =>
  Object.fromEntries([...(values ?? new Map())].map(([k, v]) => [k, toDecimalString(v, 8)]));

function categoriesUsed(ctx: Context, codes: Set<string>): MaterialBreakdownDto['categories'] {
  return [...ctx.categories.values()]
    .filter((c) => codes.has(c.code))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({
      code: c.code,
      name: c.name,
      unit: c.unit,
      purchaseStep: c.purchaseStep,
      steps: c.steps.map((s) => ({ key: s.key, label: s.label, formula: s.formula })),
      fields: c.fields.map((f) => ({ key: f.key, label: f.label })),
    }));
}

/** One row per component + size + column of the design: quantity per piece and its conversions. */
export async function designBreakdown(designNo: string): Promise<MaterialBreakdownDto> {
  const [design, ctx] = await Promise.all([findDesign(designNo), loadContext()]);
  const lookup = consumptionLookup(design);
  const rows: MaterialBreakdownDto['rows'] = [];
  const used = new Set<string>();
  for (const component of design.components) {
    for (const size of component.sizes) {
      for (const [key, qty] of Object.entries(lookup(component.name, size.size) ?? {})) {
        const { code, color } = parseVariantKey(key);
        const material = ctx.materials.get(code);
        if (!material) continue;
        used.add(material.category);
        const category = ctx.compiled.get(material.category) ?? null;
        // Cords: no denier in a design (it is entered on each order), so only the metres are shown.
        const isCord = denierFieldKey(ctx.categories.get(material.category)) !== null;
        const rules = rulesForOrder(material.rules ?? {}, denierFieldKey(ctx.categories.get(material.category)), null);
        const perPiece = category && !isCord ? convertWithCategory(category, rules, new Decimal(qty)) : null;
        const error = isCord ? CORD_PER_ORDER : perPiece?.error;
        rows.push({
          category: material.category,
          component: component.name,
          size: size.size,
          key,
          code,
          color,
          type: null,
          fields: { ...rules },
          perPiece: toDecimalString(new Decimal(qty), 8),
          perPieceSteps: stringify(perPiece?.values ?? null),
          pieces: null,
          total: null,
          totalSteps: null,
          ratePerPurchaseUnit: null,
          amount: null,
          ...(error ? { error } : {}),
        });
      }
    }
  }
  return { categories: categoriesUsed(ctx, used), rows };
}

/**
 * One row per order line + column: per piece, target pieces, totals; with `includeCost` (Admin) also the
 * rate per purchase unit and amount, using the rates saved with the order (today's where none was saved).
 */
export async function orderBreakdown(orderNo: number, includeCost: boolean): Promise<MaterialBreakdownDto> {
  const order = await findOrder(orderNo);
  const [design, ctx] = await Promise.all([DesignModel.findOne({ designNo: order.designNo }), loadContext()]);
  const lookup = consumptionLookup(design);
  const types = order.types ?? {};
  const typedKeyOf = (key: string) => {
    const material = ctx.materials.get(parseVariantKey(key).code);
    return (ctx.categories.get(material?.category ?? '')?.types?.length ?? 0) > 0 ? typedKey(key, types[key] ?? null) : key;
  };

  // Rates saved with the order (else today's), only for Admin.
  const resolve = includeCost ? await orderUnitCosts(order) : null;
  const cords = orderCords(order);

  const rows: MaterialBreakdownDto['rows'] = [];
  const used = new Set<string>();
  for (const line of effectiveLines(order, design).lines) {
    for (const [key, qty] of Object.entries(lookup(line.component, line.size) ?? {})) {
      const { code, color } = parseVariantKey(key);
      const material = ctx.materials.get(code);
      if (!material) continue;
      used.add(material.category);
      const category = ctx.compiled.get(material.category) ?? null;
      // Cords: the denier and rate entered on this order (never Material Master).
      const denierField = denierFieldKey(ctx.categories.get(material.category));
      const cord = denierField ? (cords.get(key) ?? { denier: null, ratePerUnit: null }) : null;
      const rules = rulesForOrder(material.rules ?? {}, denierField, cord?.denier);
      const perPieceQty = new Decimal(qty);
      const totalQty = perPieceQty.times(line.quantity);
      const perPiece = category ? convertWithCategory(category, rules, perPieceQty) : null;
      const total = category ? convertWithCategory(category, rules, totalQty) : null;
      const costKey = typedKeyOf(key);
      const type = costKey === key ? null : costKey.slice(key.length + 1);

      let ratePerPurchaseUnit: string | null = null;
      let amount: string | null = null;
      const cost = resolve && !cord ? resolve(costKey) : null;
      if (cord && includeCost && cord.ratePerUnit !== null) {
        ratePerPurchaseUnit = toDecimalString(new Decimal(cord.ratePerUnit), 6);
        if (total?.purchase) amount = toDecimalString(total.purchase.times(cord.ratePerUnit), 6);
      } else if (cost?.perUnit) {
        amount = toDecimalString(cost.perUnit.times(totalQty), 6);
        if (cost.rateInclGst) {
          ratePerPurchaseUnit = toDecimalString(cost.rateInclGst, 6);
        } else {
          // Older orders saved a cost per unit: rate per purchase unit = cost per unit ÷ purchase units in one unit.
          const one = category ? convertWithCategory(category, rules, new Decimal(1)).purchase : null;
          if (one && !one.isZero()) ratePerPurchaseUnit = toDecimalString(cost.perUnit.dividedBy(one), 6);
        }
      }

      rows.push({
        category: material.category,
        component: line.component,
        size: line.size,
        key,
        code,
        color,
        type,
        fields: { ...rules },
        perPiece: toDecimalString(perPieceQty, 8),
        perPieceSteps: stringify(perPiece?.values ?? null),
        pieces: line.quantity,
        total: toDecimalString(totalQty, 8),
        totalSteps: stringify(total?.values ?? null),
        ratePerPurchaseUnit,
        amount,
        ...(cord && !cord.denier ? { error: MESSAGES.CORD_DENIER_FOR_ORDER } : perPiece?.error ? { error: perPiece.error } : {}),
      });
    }
  }
  return { categories: categoriesUsed(ctx, used), rows };
}
