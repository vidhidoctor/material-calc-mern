import { APP_NAME, type DesignCostingAmountsDto, type DesignCostingCalculationDto, type DesignCostingRateRowDto } from '@app/shared';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { ColumnPrintSheet, type SheetColumn } from '../../components/ColumnPrintSheet';
import { QueryState } from '../../components/ui';
import { formatNumber, formatRupees } from '../../lib/format';
import { rowKey } from './costing-draft';
import { useDesignCosting } from './design-costing.hooks';

type Component = DesignCostingCalculationDto['components'][number];
type Row = Component['sizes'][number] & { entry?: DesignCostingRateRowDto };
type Total = DesignCostingAmountsDto & { materials: Component['materials'] };

const quantity = (value: number | null) => (value === null ? '—' : formatNumber(value, 0));
const rate = (value: number | null | undefined) => (value == null ? '—' : formatNumber(value, 4));
const money = (value: string | undefined) => (value === undefined ? '—' : formatRupees(value));

// The columns of the Rate & Pricing table, in its order.
const COLUMNS: readonly SheetColumn<Row, Total>[] = [
  { id: 'size', header: 'Size', cell: (r) => r.size },
  { id: 'stitch', header: 'Stitches', cell: (r) => quantity(r.stitch) },
  { id: 'stitchRate', header: 'Stitch Rate', cell: (r) => rate(r.entry?.stitchRate) },
  { id: 'stitchHeads', header: 'Stitch Heads', cell: (r) => rate(r.entry?.stitchHeads ?? 1) },
  { id: 'stitchCost', header: 'Stitch Cost', cell: (r) => formatRupees(r.stitchCost), total: (t) => formatRupees(t.stitchCost) },
  { id: 'laser', header: 'Laser', cell: (r) => quantity(r.laser) },
  { id: 'laserRate', header: 'Laser Rate', cell: (r) => rate(r.entry?.laserRate) },
  { id: 'laserHeads', header: 'Laser Heads', cell: (r) => rate(r.entry?.laserHeads ?? 1) },
  { id: 'laserCost', header: 'Laser Cost', cell: (r) => formatRupees(r.laserCost), total: (t) => formatRupees(t.laserCost) },
  { id: 'materialCost', header: 'Material Cost', cell: (r) => formatRupees(r.materialCost), total: (t) => formatRupees(t.materialCost) },
  { id: 'base', header: 'Base Cost', cell: (r) => formatRupees(r.base), total: (t) => formatRupees(t.base), strong: true },
  { id: 'markup', header: 'Markup', cell: (r) => formatRupees(r.markup), total: (t) => formatRupees(t.markup) },
  { id: 'finalPrice', header: 'Final Price', cell: (r) => formatRupees(r.finalPrice), total: (t) => formatRupees(t.finalPrice), strong: true },
  { id: 'remarks', header: 'Remarks', cell: (r) => r.entry?.note ?? '', className: 'po-remarks' },
];

/** Printable Rate & Pricing table: the saved figures, with the columns saved in the print settings. */
export function RateSheetPrintPage() {
  const designNo = useParams().designNo ?? '';
  const query = useDesignCosting(designNo);

  useEffect(() => {
    document.title = `Rate and pricing ${designNo}`;
    return () => {
      document.title = APP_NAME;
    };
  }, [designNo]);

  return (
    <div className="po-print">
      <QueryState query={query}>
        {(data) => {
          const entries = new Map(data.saved.rows.map((r) => [rowKey(r.component, r.size), r]));
          // One cost column per material the design uses (the ticked ones print), just before Material Cost.
          const materialColumns: SheetColumn<Row, Total>[] = data.calculation.materials.map((m) => ({
            id: m.key,
            header: m.detail ? `${m.label} ${m.detail}` : m.label,
            cell: (r) => money(r.materials[m.key]),
            total: (t) => money(t.materials[m.key]),
          }));
          return (
            <ColumnPrintSheet
              title="RATE & PRICING"
              backTo={`/design-costing/${encodeURIComponent(designNo)}`}
              backLabel="Rate & Pricing"
              sheet="rate-costing"
              columns={COLUMNS}
              materialColumns={{ before: 'materialCost', columns: materialColumns }}
              components={data.calculation.components.map((c) => ({
                name: c.name,
                rows: c.sizes.map((s) => ({ ...s, entry: entries.get(rowKey(c.name, s.size)) })),
                total: { ...c.total, materials: c.materials },
              }))}
            >
              <p className="po-order-ref">
                D.N. <strong>{data.design.designNo}</strong> · {data.design.productName} · Discount <strong>{formatNumber(data.saved.discountPercent)}%</strong> · Markup <strong>{formatNumber(data.calculation.markupPercent)}%</strong>
              </p>
            </ColumnPrintSheet>
          );
        }}
      </QueryState>
    </div>
  );
}
