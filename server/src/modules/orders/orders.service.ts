import { MESSAGES, parseVariantKey, sortVariantKeys, type OrderDto, type OrderListItemDto, type OrderStatus, type OrderSummaryDto } from '@app/shared';
import { calculateRequirements, toDecimalString } from '../../calculation/engine.js';
import { AppError } from '../../lib/app-error.js';
import { currentUnitCosts } from '../costing/costing.service.js';
import { consumptionLookup, findDesign } from '../designs/designs.service.js';
import { DesignModel } from '../designs/design.model.js';
import { loadMaterialsWithCategories, toMaterialColumn } from '../materials/materials.service.js';
import { nextOrderNo, nextPartyOrderNo, OrderModel, type Order, type OrderDocument, type OrderLine } from './order.model.js';
import type { CreateOrderInput } from './orders.validation.js';

export const ORDER_MESSAGES = {
  notFound: (orderNo: number) => `Order #${orderNo} not found.`,
  noComponents: (designNo: string) => `Design ${designNo} has no components yet.`,
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
  };
}

export async function findOrder(orderNo: number): Promise<OrderDocument> {
  const order = await OrderModel.findOne({ orderNo });
  if (!order) throw new AppError(404, ORDER_MESSAGES.notFound(orderNo));
  return order;
}

export async function createOrder(input: CreateOrderInput): Promise<OrderDto> {
  const design = await findDesign(input.designNo);
  if (design.components.length === 0) throw new AppError(400, ORDER_MESSAGES.noComponents(design.designNo));

  let lines: OrderLine[];
  if (input.lines === undefined) {
    const quantity = input.quantity as number; // validated: integer > 0
    lines = design.components.flatMap((c) => c.sizes.map((s) => ({ component: c.name, size: s.size, quantity })));
  } else {
    lines = input.lines.filter((line) => line.quantity > 0);
    const lookup = consumptionLookup(design);
    const missing = lines.filter((line) => lookup(line.component, line.size) === null).map(({ component, size }) => ({ component, size }));
    if (missing.length > 0) throw new AppError(400, MESSAGES.CONSUMPTION_MISSING, { missing });
  }

  // Save today's material rates with the order (its cost must not change when rates change later).
  const lookup = consumptionLookup(design);
  const unitCosts = await currentUnitCosts(lines.flatMap((l) => Object.keys(lookup(l.component, l.size) ?? {})));

  const order = await OrderModel.create({
    orderNo: await nextOrderNo(),
    partyOrderNo: await nextPartyOrderNo(design.designNo, input.party),
    designNo: design.designNo,
    item: design.productName,
    party: input.party,
    orderDate: new Date(`${input.orderDate ?? today()}T00:00:00Z`),
    quantity: input.lines === undefined ? input.quantity : null,
    status: 'PENDING',
    lines,
    unitCosts,
  });
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
