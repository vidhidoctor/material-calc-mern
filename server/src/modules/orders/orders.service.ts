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
import { calculateRequirements, toDecimalString } from '../../calculation/engine.js';
import { AppError } from '../../lib/app-error.js';
import { currentUnitCosts } from '../costing/costing.service.js';
import { consumptionLookup, findDesign } from '../designs/designs.service.js';
import type { DesignDocument } from '../designs/design.model.js';
import { DesignModel } from '../designs/design.model.js';
import { loadMaterialsWithCategories, toMaterialColumn, type CategoryMap } from '../materials/materials.service.js';
import { nextOrderNo, nextPartyOrderNo, OrderModel, type Order, type OrderDocument, type OrderLine } from './order.model.js';
import type { CreateOrderInput, UpdateOrderInput } from './orders.validation.js';

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
  const unitCosts = await currentUnitCosts(content.costKeys);

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
    unitCosts,
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

  const saved: Record<string, string> = { ...(order.unitCosts ?? {}) };
  const missingKeys = content.costKeys.filter((k) => saved[k] === undefined);
  if (missingKeys.length > 0) Object.assign(saved, await currentUnitCosts(missingKeys));

  if (input.party !== order.party) {
    order.partyOrderNo = await nextPartyOrderNo(order.designNo, input.party);
    order.party = input.party;
  }
  if (input.orderDate) order.orderDate = new Date(`${input.orderDate}T00:00:00Z`);
  order.quantity = content.quantity;
  order.lines = content.lines;
  order.types = content.types;
  order.unitCosts = saved;
  order.markModified('types');
  order.markModified('unitCosts');
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

/** Requirement per row = the design's current consumption × quantity, plus totals. */
export async function getOrderSummary(orderNo: number): Promise<OrderSummaryDto> {
  const order = await findOrder(orderNo);
  const [design, { materials, categories }] = await Promise.all([
    DesignModel.findOne({ designNo: order.designNo }),
    loadMaterialsWithCategories(),
  ]);
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

  return {
    orderNo: order.orderNo,
    columns: keys
      .filter((key) => totals[key] !== undefined)
      .map((key) => {
        const { code, color } = parseVariantKey(key);
        const material = materials.find((m) => m.code === code);
        return { key, code, color, unit: material ? toMaterialColumn(material, categories).unit : '' };
      }),
    rows: result.rows.map((row) => ({
      component: row.component,
      size: row.size,
      quantity: row.quantity,
      requirements: Object.fromEntries([...row.requirements].map(([code, value]) => [code, toDecimalString(value)])),
    })),
    totals,
    errors: result.errors,
  };
}
