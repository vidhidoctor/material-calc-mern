import type { OrderSummaryColumnDto, PurchaseOrderDto, PurchaseOrderRowDto, PurchaseOrderSectionDto } from '@app/shared';
import { Decimal } from '../../calculation/engine.js';
import { loadMaterialsWithCategories } from '../materials/materials.service.js';
import { findOrder, getOrderSummary, toDateOnly } from './orders.service.js';

/**
 * The purchase order slip, built from the order summary (no calculation of its own): one section per
 * component (1. DUPATTA, 2. KALI …) in the order's component order, each listing every material that
 * component uses, in Material Master order: total quantity (PCS, MTR) and Series in VC in its purchase
 * unit — whole units (CD) rounded up for that component, weights (KG) as worked out (cord with this
 * order's denier). Components added to the design after the order are included (see order-lines.ts).
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
      // Names written when the slip listed beads, cords … per category (K:<category>) still show.
      name: names.get(id) ?? names.get(rowId(`K:${column.category}`, column.key)) ?? '',
    };
  };
  const categoryName = (code: string) => categories.get(code)?.name ?? code;

  const sections: PurchaseOrderSectionDto[] = summary.components.flatMap((component) => {
    const columns = summary.columns.filter((c) => component.requirements[c.key] !== undefined);
    if (columns.length === 0) return [];
    const id = `C:${component.component}`;
    const rows = columns.map((c) => {
      const purchase = component.purchase[c.key];
      const qty = purchase && c.wholeUnits ? new Decimal(purchase).toDecimalPlaces(0, Decimal.ROUND_UP).toString() : (purchase ?? null);
      return row(id, c, qty, component.requirements[c.key]!);
    });
    const used = new Set(columns.map((c) => c.category));
    return [{ id, title: component.component, itemHeader: used.size === 1 ? categoryName([...used][0]!) : 'Material', unit: sharedUnit(rows), rows }];
  });

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

/**
 * Saves the names written on the slip (blank removes a name). Names are kept exactly as entered. Names
 * from the old per-category layout (K:…) become names of the component rows that show them, so each row
 * can then be changed or cleared on its own.
 */
export async function savePurchaseOrderNames(orderNo: number, input: Record<string, string>): Promise<PurchaseOrderDto> {
  const order = await findOrder(orderNo);
  const shown = (await getPurchaseOrder(orderNo)).sections.flatMap((s) => s.rows);
  const names = new Map((order.poNames ?? []).filter((n) => !n.key.startsWith('K:')).map((n) => [n.key, n.name]));
  for (const row of shown) if (row.name && !names.has(row.id)) names.set(row.id, row.name);
  for (const [key, name] of Object.entries(input)) {
    if (name.trim() === '') names.delete(key);
    else names.set(key, name);
  }
  order.poNames = [...names].map(([key, name]) => ({ key, name }));
  await order.save();
  return getPurchaseOrder(orderNo);
}
