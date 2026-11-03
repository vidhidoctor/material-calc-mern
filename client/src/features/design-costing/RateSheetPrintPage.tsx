import { APP_NAME, type DesignCostingAmountsDto, type DesignCostingCalculationDto, type DesignCostingRateRowDto } from '@app/shared';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { ColumnPrintSheet, type SheetColumn } from '../../components/ColumnPrintSheet';
import { QueryState } from '../../components/ui';
import { formatNumber, formatRupees } from '../../lib/format';
import { rowKey } from './costing-draft';
import { useDesignCosting } from './design-costing.hooks';

type Row = DesignCostingCalculationDto['components'][number]['sizes'][number] & { entry?: DesignCostingRateRowDto };

const quantity = (value: number | null) => (value === null ? '—' : formatNumber(value, 0));
const rate = (value: number | null | undefined) => (value == null ? '—' : formatNumber(value, 4));

// The columns of the Rate & Costing table, in its order.
const COLUMNS: readonly SheetColumn<Row, DesignCostingAmountsDto>[] = [
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
];

/** Printable Rate & Costing table: the saved figures, with the columns saved in the print settings. */
export function RateSheetPrintPage() {
  const designNo = useParams().designNo ?? '';
  const query = useDesignCosting(designNo);

  useEffect(() => {
    document.title = `Rate and costing ${designNo}`;
    return () => {
      document.title = APP_NAME;
    };
  }, [designNo]);

  return (
    <div className="po-print">
      <QueryState query={query}>
        {(data) => {
          const entries = new Map(data.saved.rows.map((r) => [rowKey(r.component, r.size), r]));
          return (
            <ColumnPrintSheet
              title="RATE & COSTING"
              backTo={`/design-costing/${encodeURIComponent(designNo)}`}
              backLabel="Rate & Costing"
              sheet="rate-costing"
              columns={COLUMNS}
              components={data.calculation.components.map((c) => ({
                name: c.name,
                rows: c.sizes.map((s) => ({ ...s, entry: entries.get(rowKey(c.name, s.size)) })),
                total: c.total,
              }))}
            >
              <p className="po-order-ref">
                D.N. <strong>{data.design.designNo}</strong> · {data.design.productName}
              </p>
            </ColumnPrintSheet>
          );
        }}
      </QueryState>
    </div>
  );
}
