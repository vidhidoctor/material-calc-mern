import type { OrderDto, OrderSummaryColumnDto, OrderSummaryDto } from '@app/shared';
import { formatDate, formatNumber } from '../../lib/format';

/** Colour · type of a material column (e.g. WHITE · PURE GLASS). */
export const columnLabel = (column: OrderSummaryColumnDto, types: Record<string, string>) =>
  [column.color, types[column.key]].filter(Boolean).join(' · ');

/**
 * Lengths (e.g. cord in MTR) are listed per size in their own unit and converted only in the total
 * (3,200 MTR → 65 KG), like the purchase order sheet. Pieces (sequences, beads) are listed per size in
 * the purchase unit (CD, KG).
 */
export const byLength = (m: OrderSummaryColumnDto) => m.unit !== 'PCS' && m.orderUnit !== null;

/** The unit a size row shows. */
export const rowUnit = (m: OrderSummaryColumnDto) => (byLength(m) || !m.orderUnit ? m.unit : m.orderUnit);

/** A size (or component) value as shown: CD 2 decimals, KG 3, lengths/pieces 2; null when not used. */
export function rowValue(m: OrderSummaryColumnDto, purchase: Record<string, string>, requirements: Record<string, string>): string | null {
  const inPurchaseUnit = !byLength(m) && m.orderUnit !== null;
  const value = inPurchaseUnit ? purchase[m.key] : requirements[m.key];
  if (!value) return null;
  return formatNumber(value, inPurchaseUnit ? (m.wholeUnits ? 2 : 3) : 2);
}

/** What to buy for a column (whole units rounded up once, on the total); null when not convertible. */
export function totalToBuy(m: OrderSummaryColumnDto, summary: OrderSummaryDto): string | null {
  const buy = summary.buy[m.key];
  if (!m.orderUnit || !buy) return null;
  return formatNumber(buy, m.wholeUnits ? 0 : 3);
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The purchase requirement as a CSV sheet (opens in Excel): order details, sizes × materials, total. */
export function purchaseCsv(summary: OrderSummaryDto, order: OrderDto): string {
  const columns = summary.columns;
  const header = (m: OrderSummaryColumnDto) => [m.code, columnLabel(m, order.types), `(${rowUnit(m)})`].filter(Boolean).join(' ');
  const plain = (text: string | null) => (text ?? '').replace(/,/g, '');
  const lines: string[][] = [
    ['Purchase order'],
    ['Design No.', order.designNo],
    ['Item', order.item],
    ['Party', `${order.party}-${order.partyOrderNo}`],
    ['Order date', formatDate(order.orderDate)],
    [],
    ['Component', 'Size', 'Pcs', ...columns.map(header)],
    ...summary.rows.map((row) => [row.component, row.size, String(row.quantity), ...columns.map((m) => plain(rowValue(m, row.purchase, row.requirements)))]),
    [
      'Total to buy',
      '',
      String(summary.rows.reduce((sum, r) => sum + r.quantity, 0)),
      ...columns.map((m) => {
        const buy = totalToBuy(m, summary);
        if (!buy) return `${plain(formatNumber(summary.totals[m.key]))} ${m.unit}`;
        const length = byLength(m) ? `${plain(formatNumber(summary.totals[m.key]))} ${m.unit} = ` : '';
        return `${length}${plain(buy)} ${m.orderUnit}`;
      }),
    ],
  ];
  return lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n');
}

/** Downloads the purchase requirement as e.g. "PO KETAN-123 FR-3.csv". */
export function downloadPurchaseCsv(summary: OrderSummaryDto, order: OrderDto): void {
  // BOM so Excel reads ₹/· correctly.
  const blob = new Blob(['﻿', purchaseCsv(summary, order)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `PO ${order.designNo} ${order.party}-${order.partyOrderNo}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
