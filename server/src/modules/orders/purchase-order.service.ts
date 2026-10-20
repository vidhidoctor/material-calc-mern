import type { OrderSummaryColumnDto, PurchaseOrderDto, PurchaseOrderRowDto, PurchaseOrderSectionDto } from '@app/shared';
import { Decimal } from '../../calculation/engine.js';
import { loadMaterialsWithCategories } from '../materials/materials.service.js';
import { findOrder, getOrderSummary, toDateOnly } from './orders.service.js';

/**
 * The purchase order slip, built from the order summary (no calculation of its own):
 * - materials bought in whole units (e.g. sequences in CD) are listed per component (1. KALI, 2. BLOUSE …),
 *   each rounded up to whole units for that component;
 * - every other category (beads, cords …) is totalled for the whole order in one section per category.
 * Only the Name of each row is entered by hand (saved on the order, printed exactly as entered).
 */

const rowId = (sectionId: string, columnKey: string) => `${sectionId}::${columnKey}`;
const sharedUnit = (rows: PurchaseOrderRowDto[]) => (rows.every((r) => r.unit === rows[0]?.unit) ? (rows[0]?.unit ?? null) : null);

export async function getPurchaseOrder(orderNo: number): Promise<PurchaseOrderDto> {
  const [order, summary, { materials, categories }] = await Promise.all([findOrder(orderNo), getOrderSummary(orderNo), loadMaterialsWithCategories()]);
  const names = new Map((order.poNames ?? []).map((n) => [n.key, n.name]));
  const types = order.types ?? {};
  const materialByCode = new Map(materials.map((m) => [m.code, m]));

  const row = (sectionId: string, column: OrderSummaryColumnDto, qty: string | null, totalQty: string): PurchaseOrderRowDto => {
    const id = rowId(sectionId, column.key);
    const material = materialByCode.get(column.code);
    return {
      id,
      // Same as the order drawer: the material code (SEQ-3MM); cords their name (e.g. "PC"), as in Punching.
      label: (column.cord && material?.name?.trim()) || column.code,
      detail: [column.color, types[column.key]].filter(Boolean).join(' · '),
      qty: column.orderUnit ? qty : null,
      unit: column.orderUnit,
      totalQty,
      totalUnit: column.unit,
      name: names.get(id) ?? '',
    };
  };
  const categoryName = (code: string) => categories.get(code)?.name ?? code;

  const sections: PurchaseOrderSectionDto[] = [];

  // Per component: whole-unit materials (sequences in CD), rounded up per component.
  const perComponent = summary.columns.filter((c) => c.wholeUnits);
  for (const component of summary.components) {
    const columns = perComponent.filter((c) => component.requirements[c.key] !== undefined);
    if (columns.length === 0) continue;
    const id = `C:${component.component}`;
    const rows = columns.map((c) => {
      const purchase = component.purchase[c.key];
      return row(id, c, purchase ? new Decimal(purchase).toDecimalPlaces(0, Decimal.ROUND_UP).toString() : null, component.requirements[c.key]!);
    });
    const used = new Set(columns.map((c) => c.category));
    sections.push({ id, title: component.component, itemHeader: used.size === 1 ? categoryName([...used][0]!) : 'Material', unit: sharedUnit(rows), rows });
  }

  // Whole order, one section per category (beads, cords …), in Material Master order.
  const others = summary.columns.filter((c) => !c.wholeUnits);
  const sorted = [...categories.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const category of sorted) {
    const columns = others.filter((c) => c.category === category.code);
    if (columns.length === 0) continue;
    const id = `K:${category.code}`;
    const rows = columns.map((c) => row(id, c, summary.buy[c.key] ?? null, summary.totals[c.key]!));
    sections.push({ id, title: category.name.toUpperCase(), itemHeader: 'Material', unit: sharedUnit(rows), rows });
  }
  // Columns whose material or category no longer exists.
  const orphans = others.filter((c) => !categories.has(c.category));
  if (orphans.length > 0) {
    const id = 'K:OTHER';
    const rows = orphans.map((c) => row(id, c, summary.buy[c.key] ?? null, summary.totals[c.key]!));
    sections.push({ id, title: 'OTHER', itemHeader: 'Material', unit: sharedUnit(rows), rows });
  }

  return {
    orderNo: order.orderNo,
    partyOrderNo: order.partyOrderNo,
    designNo: order.designNo,
    item: order.item,
    party: order.party,
    orderDate: toDateOnly(order.orderDate),
    sections,
  };
}

/** Saves the names written on the slip (blank removes a name). Names are kept exactly as entered. */
export async function savePurchaseOrderNames(orderNo: number, input: Record<string, string>): Promise<PurchaseOrderDto> {
  const order = await findOrder(orderNo);
  const names = new Map((order.poNames ?? []).map((n) => [n.key, n.name]));
  for (const [key, name] of Object.entries(input)) {
    if (name.trim() === '') names.delete(key);
    else names.set(key, name);
  }
  order.poNames = [...names].map(([key, name]) => ({ key, name }));
  await order.save();
  return getPurchaseOrder(orderNo);
}
