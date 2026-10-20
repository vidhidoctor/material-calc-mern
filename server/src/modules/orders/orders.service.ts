import {
  MESSAGES,
  normalizeType,
  parseVariantKey,
  sortVariantKeys,
  typedKey,
  variantKey,
  variantLabel,
  type OrderDto,
  type OrderListItemDto,
  type OrderStatus,
  type OrderSummaryDto,
} from '@app/shared';
import { calculateRequirements, convertWithCategory, Decimal, toDecimalString } from '../../calculation/engine.js';
import { AppError } from '../../lib/app-error.js';
import { currentUnitRates } from '../costing/costing.service.js';
import { consumptionLookup, findDesign } from '../designs/designs.service.js';
import type { DesignDocument } from '../designs/design.model.js';
import { DesignModel } from '../designs/design.model.js';
import { compileCategories, loadMaterialsWithCategories, toMaterialColumn } from '../materials/materials.service.js';
import { denierFieldKey, orderCords, rulesForOrder, type OrderCordInput } from './order-cords.js';
import { nextOrderNo, nextPartyOrderNo, OrderModel, type Order, type OrderDocument, type OrderLine } from './order.model.js';
import type { CreateOrderInput, OrderCordsInput, UpdateOrderInput } from './orders.validation.js';

export const ORDER_MESSAGES = {
  notFound: (orderNo: number) => `Order #${orderNo} not found.`,
  noComponents: (designNo: string) => `Design ${designNo} has no components yet.`,
  typeRequired: (category: string, column: string) => `Choose a ${category} type for ${column}.`,
  unknownType: (category: string, type: string) => `${type} is not a ${category} type. Add it in Material Master → Categories.`,
} as const;

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's date (server local time) as YYYY-MM-DD. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function totalPieces(lines: readonly OrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function toOrderListItem(order: Order): OrderListItemDto {
  return {
    orderNo: order.orderNo,
    partyOrderNo: order.partyOrderNo,
    designNo: order.designNo,
    item: order.item,
    party: order.party,
    orderDate: toDateOnly(order.orderDate),
    quantity: order.quantity ?? null,
    totalPieces: totalPieces(order.lines),
    status: order.status,
    createdAt: order.createdAt.toISOString(),
  };
}

function toOrderDto(order: Order): OrderDto {
  return {
    ...toOrderListItem(order),
    lines: order.lines.map((line) => ({ component: line.component, size: line.size, quantity: line.quantity })),
    types: { ...(order.types ?? {}) },
  };
}

export async function findOrder(orderNo: number): Promise<OrderDocument> {
  const order = await OrderModel.findOne({ orderNo });
  if (!order) throw new AppError(404, ORDER_MESSAGES.notFound(orderNo));
  return order;
}

interface OrderContent {
  lines: OrderLine[];
  quantity: number | null;
  types: Record<string, string>;
  /** Purchase/cost keys of the order: column key, with the chosen type for typed materials. */
  costKeys: string[];
}

/**
 * Lines from "same for all rows" or "per row", plus the type chosen for every typed column
 * (e.g. sequence finish) the lines use. Shared by create and edit.
 */
async function buildOrderContent(design: DesignDocument, input: UpdateOrderInput): Promise<OrderContent> {
  if (design.components.length === 0) throw new AppError(400, ORDER_MESSAGES.noComponents(design.designNo));
  const lookup = consumptionLookup(design);

  let lines: OrderLine[];
  if (input.lines === undefined) {
    const quantity = input.quantity as number; // validated: integer > 0
    lines = design.components.flatMap((c) => c.sizes.map((s) => ({ component: c.name, size: s.size, quantity })));
  } else {
    lines = input.lines.filter((line) => line.quantity > 0);
    const missing = lines.filter((line) => lookup(line.component, line.size) === null).map(({ component, size }) => ({ component, size }));
    if (missing.length > 0) throw new AppError(400, MESSAGES.CONSUMPTION_MISSING, { missing });
  }

  // Types: required for every typed column the order uses; must be one of the category's types.
  const { materials, categories } = await loadMaterialsWithCategories();
  const categoryOf = new Map(materials.map((m) => [m.code, categories.get(m.category)]));
  const given = new Map(Object.entries(input.types).map(([key, type]) => [variantKey(parseVariantKey(key).code, parseVariantKey(key).color), normalizeType(type)]));
  const columns = sortVariantKeys(
    lines.flatMap((l) => Object.keys(lookup(l.component, l.size) ?? {})),
    materials.map((m) => m.code),
  );
  const types: Record<string, string> = {};
  const costKeys: string[] = [];
  for (const column of columns) {
    const category = categoryOf.get(parseVariantKey(column).code);
    if (!category || (category.types?.length ?? 0) === 0) {
      costKeys.push(column);
      continue;
    }
    const type = given.get(column);
    if (!type) throw new AppError(400, ORDER_MESSAGES.typeRequired(category.name, variantLabel(column)));
    if (!category.types.includes(type)) throw new AppError(400, ORDER_MESSAGES.unknownType(category.name, type));
    types[column] = type;
    costKeys.push(typedKey(column, type));
  }

  return { lines, quantity: input.lines === undefined ? (input.quantity as number) : null, types, costKeys };
}

export async function createOrder(input: CreateOrderInput): Promise<OrderDto> {
  const design = await findDesign(input.designNo);
  const content = await buildOrderContent(design, input);
  // Save today's rates with the order (its cost must not change when rates change later).
  const unitRates = await currentUnitRates(content.costKeys);

  const order = await OrderModel.create({
    orderNo: await nextOrderNo(),
    partyOrderNo: await nextPartyOrderNo(design.designNo, input.party),
    designNo: design.designNo,
    item: design.productName,
    party: input.party,
    orderDate: new Date(`${input.orderDate ?? today()}T00:00:00Z`),
    quantity: content.quantity,
    status: 'PENDING',
    lines: content.lines,
    types: content.types,
    unitRates,
  });
  return toOrderDto(order);
}

/**
 * Edits party, date, quantities and types (the design cannot change). A new party gets the next
 * number in that party's series. Saved rates are kept; new columns/types get today's rate.
 */
export async function updateOrder(orderNo: number, input: UpdateOrderInput): Promise<OrderDto> {
  const order = await findOrder(orderNo);
  const design = await findDesign(order.designNo);
  const content = await buildOrderContent(design, input);

  // Keep the rates saved with the order; new columns/types get today's rate.
  const saved: Record<string, string> = { ...(order.unitRates ?? {}) };
  const missingKeys = content.costKeys.filter((k) => saved[k] === undefined && order.unitCosts?.[k] === undefined);
  if (missingKeys.length > 0) Object.assign(saved, await currentUnitRates(missingKeys));

  if (input.party !== order.party) {
    order.partyOrderNo = await nextPartyOrderNo(order.designNo, input.party);
    order.party = input.party;
  }
  if (input.orderDate) order.orderDate = new Date(`${input.orderDate}T00:00:00Z`);
  order.quantity = content.quantity;
  order.lines = content.lines;
  order.types = content.types;
  order.unitRates = saved;
  order.markModified('types');
  order.markModified('unitRates');
  await order.save();
  return toOrderDto(order);
}

export async function listOrders(): Promise<OrderListItemDto[]> {
  return (await OrderModel.find().sort({ orderNo: -1 })).map(toOrderListItem);
}

export async function getOrder(orderNo: number): Promise<OrderDto> {
  return toOrderDto(await findOrder(orderNo));
}

/**
 * Deletes an order entered by mistake. Its number is not reused (the series continues), so labels
 * of other orders never change.
 */
export async function deleteOrder(orderNo: number): Promise<void> {
  const order = await findOrder(orderNo);
  await order.deleteOne();
}

export async function updateStatus(orderNo: number, status: OrderStatus): Promise<OrderDto> {
  const order = await findOrder(orderNo);
  order.status = status;
  await order.save();
  return toOrderDto(order);
}

export const CORD_MESSAGES = {
  notACord: (key: string) => `${key} is not a cord of this order.`,
  rateNeedsCost: 'Only users who can see costs can enter the cord rate.',
} as const;

/** Merges entered cord values into the order's (undefined = unchanged; both empty = removed). */
function mergeCords(current: Map<string, OrderCordInput>, input: OrderCordsInput['cords']): Map<string, OrderCordInput> {
  const cords = new Map(current);
  for (const [key, entry] of Object.entries(input)) {
    const merged = { ...(cords.get(key) ?? { denier: null, ratePerUnit: null }) };
    if (entry.denier !== undefined) merged.denier = entry.denier;
    if (entry.ratePerUnit !== undefined) merged.ratePerUnit = entry.ratePerUnit;
    if (merged.denier === null && merged.ratePerUnit === null) cords.delete(key);
    else cords.set(key, merged);
  }
  return cords;
}

/**
 * Saves the cord denier and rate per KG (incl. GST) for this order; weight and cost are recalculated.
 * The rate needs COST_VIEW. With `preview`, nothing is saved: the summary is worked out with the values
 * as entered (the drawer's popup shows weight and cost while typing).
 */
export async function saveOrderCords(
  orderNo: number,
  input: OrderCordsInput['cords'],
  { canCost, preview = false }: { canCost: boolean; preview?: boolean },
): Promise<OrderSummaryDto> {
  const order = await findOrder(orderNo);
  const cordKeys = new Set((await getOrderSummary(orderNo)).columns.filter((c) => c.cord).map((c) => c.key));
  for (const [key, entry] of Object.entries(input)) {
    if (!cordKeys.has(key)) throw new AppError(400, CORD_MESSAGES.notACord(key));
    if (entry.ratePerUnit !== undefined && !canCost) throw new AppError(403, CORD_MESSAGES.rateNeedsCost);
  }
  const cords = mergeCords(orderCords(order), input);
  if (preview) return getOrderSummary(orderNo, { includeCost: canCost, cords });
  order.cords = [...cords].map(([key, c]) => ({ key, denier: c.denier, ratePerUnit: c.ratePerUnit }));
  await order.save();
  return getOrderSummary(orderNo, { includeCost: canCost });
}

/**
 * Requirement per row = the design's current consumption × quantity, in the category unit (e.g. PCS)
 * and in the unit the order shows (the category's order step, e.g. CD; else its purchase step).
 * Order totals are converted from the total consumption, never from rounded rows; whole-unit
 * categories round only that total up (what to buy).
 */
export async function getOrderSummary(
  orderNo: number,
  { includeCost = false, cords: cordsOverride }: { includeCost?: boolean; cords?: Map<string, OrderCordInput> } = {},
): Promise<OrderSummaryDto> {
  const order = await findOrder(orderNo);
  const [design, { materials, categories }] = await Promise.all([
    DesignModel.findOne({ designNo: order.designNo }),
    loadMaterialsWithCategories(),
  ]);
  const compiled = compileCategories(categories);
  const lookup = consumptionLookup(design);
  const lines = order.lines.map(({ component, size, quantity }) => ({ component, size, quantity, consumption: lookup(component, size) }));
  // Columns = material + colour variants the order's lines use, in Material Master order.
  const keys = sortVariantKeys(
    lines.flatMap((l) => Object.keys(l.consumption ?? {})),
    materials.map((m) => m.code),
  );
  const result = calculateRequirements(lines, keys);

  const totals: Record<string, string> = {};
  for (const [code, total] of result.totals) if (!total.isZero()) totals[code] = toDecimalString(total);
  const usedKeys = keys.filter((key) => totals[key] !== undefined);

  // How each column converts to its order unit. Cords use the denier entered on the order (never Material Master).
  const cords = cordsOverride ?? orderCords(order);
  const converters = new Map(
    usedKeys.map((key) => {
      const material = materials.find((m) => m.code === parseVariantKey(key).code);
      const category = material ? categories.get(material.category) : undefined;
      const formulas = category ? compiled.get(category.code) : null;
      const stepKey = category ? (category.orderStep ?? category.purchaseStep) : '';
      const step = category?.steps.find((st) => st.key === stepKey);
      const denierField = denierFieldKey(category);
      const cordInput = cords.get(key);
      const rules = material ? rulesForOrder(material.rules ?? {}, denierField, cordInput?.denier) : {};
      const convert = (total: Decimal): Decimal | null =>
        formulas && material ? (convertWithCategory(formulas, rules, total).values?.get(stepKey) ?? null) : null;
      const purchaseOf = (total: Decimal): Decimal | null => (formulas && material ? convertWithCategory(formulas, rules, total).purchase : null);
      const check = formulas && material ? convertWithCategory(formulas, rules, new Decimal(1)) : null;
      const error = !formulas
        ? MESSAGES.CONVERSION_RULE_MISSING
        : denierField && !cordInput?.denier
          ? MESSAGES.CORD_DENIER_FOR_ORDER
          : check?.error;
      const rateStep = category?.steps.find((st) => st.key === category.purchaseStep);
      const cord = denierField
        ? { denier: cordInput?.denier ?? null, ratePerUnit: cordInput?.ratePerUnit ?? null, rateUnit: rateStep?.label ?? category?.purchaseStep ?? '' }
        : null;
      return [key, { material, category, unitLabel: step?.label ?? null, convert, purchaseOf, cord, error }] as const;
    }),
  );
  const toPurchase = (requirements: Map<string, Decimal>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, value] of requirements) {
      const converted = converters.get(key)?.convert(value);
      if (converted) out[key] = toDecimalString(converted);
    }
    return out;
  };

  const components: OrderSummaryDto['components'] = [];
  const componentTotals = new Map<string, Map<string, Decimal>>();
  for (const row of result.rows) {
    let group = components.at(-1);
    if (!group || group.component !== row.component) {
      group = { component: row.component, quantity: 0, requirements: {}, purchase: {} };
      components.push(group);
      componentTotals.set(row.component, new Map());
    }
    group.quantity += row.quantity;
    const sums = componentTotals.get(row.component)!;
    for (const [key, value] of row.requirements) sums.set(key, (sums.get(key) ?? new Decimal(0)).plus(value));
  }
  for (const group of components) {
    const sums = componentTotals.get(group.component)!;
    group.requirements = Object.fromEntries([...sums].map(([key, value]) => [key, toDecimalString(value)]));
    group.purchase = toPurchase(sums);
  }

  const purchaseTotals = toPurchase(new Map(usedKeys.map((key) => [key, result.totals.get(key)!])));
  const buy: Record<string, string> = {};
  for (const [key, value] of Object.entries(purchaseTotals)) {
    const whole = converters.get(key)?.category?.wholeUnits ?? false;
    buy[key] = whole ? new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_UP).toString() : value;
  }

  /** Cord: weight × rate per KG (purchase step), only for COST_VIEW. */
  const cordDto = (key: string, cord: { denier: number | null; ratePerUnit: number | null; rateUnit: string }) => {
    const weight = cord.denier ? converters.get(key)!.purchaseOf(result.totals.get(key)!) : null;
    const showCost = includeCost && cord.ratePerUnit !== null;
    return {
      denier: cord.denier,
      ratePerUnit: showCost ? toDecimalString(new Decimal(cord.ratePerUnit!)) : null,
      cost: showCost && weight ? toDecimalString(weight.times(cord.ratePerUnit!)) : null,
      rateUnit: cord.rateUnit,
    };
  };

  return {
    orderNo: order.orderNo,
    columns: usedKeys.map((key) => {
      const { code, color } = parseVariantKey(key);
      const c = converters.get(key)!;
      return {
        key,
        code,
        color,
        unit: c.material ? toMaterialColumn(c.material, categories).unit : '',
        category: c.material?.category ?? '',
        orderUnit: c.error ? null : c.unitLabel,
        wholeUnits: c.category?.wholeUnits ?? false,
        categoryName: c.category?.name ?? '',
        ...(c.cord ? { cord: cordDto(key, c.cord) } : {}),
        ...(c.error ? { error: c.error } : {}),
      };
    }),
    rows: result.rows.map((row) => ({
      component: row.component,
      size: row.size,
      quantity: row.quantity,
      requirements: Object.fromEntries([...row.requirements].map(([code, value]) => [code, toDecimalString(value)])),
      purchase: toPurchase(row.requirements),
    })),
    components,
    totals,
    purchaseTotals,
    buy,
    errors: result.errors,
  };
}
