import { APP_NAME, type JobWorkAmountsDto, type JobWorkCalculationDto, type JobWorkInputDto } from '@app/shared';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { ColumnPrintSheet, type SheetColumn } from '../../components/ColumnPrintSheet';
import { QueryState } from '../../components/ui';
import { formatNumber, formatRupees } from '../../lib/format';
import { useJobWorkCosting } from './job-work-costing.hooks';

type Row = JobWorkCalculationDto['components'][number]['sizes'][number] & { entry?: JobWorkInputDto['rows'][number] };

const rowKey = (component: string, size: string) => `${component}\u0000${size}`;
const quantity = (value: number | null) => (value === null ? '—' : formatNumber(value, 0));
const rate = (value: number | null | undefined) => (value == null ? '—' : formatNumber(value, 4));

// The columns of the Job Work Summary table, in its order.
const COLUMNS: readonly SheetColumn<Row, JobWorkAmountsDto>[] = [
  { id: 'size', header: 'Size', cell: (r) => r.size },
  { id: 'stitch', header: 'Stitches', cell: (r) => quantity(r.stitch) },
  { id: 'stitchRate', header: 'Stitch Rate', cell: (r) => rate(r.entry?.stitchRate) },
  { id: 'stitchHeads', header: 'Stitch Heads', cell: (r) => rate(r.entry?.stitchHeads ?? 1) },
  { id: 'stitchCost', header: 'Stitch Cost', cell: (r) => formatRupees(r.stitchCost), total: (t) => formatRupees(t.stitchCost) },
  { id: 'laser', header: 'Laser', cell: (r) => quantity(r.laser) },
  { id: 'laserRate', header: 'Laser Rate', cell: (r) => rate(r.entry?.laserRate) },
  { id: 'laserHeads', header: 'Laser Heads', cell: (r) => rate(r.entry?.laserHeads ?? 1) },
  { id: 'laserCost', header: 'Laser Cost', cell: (r) => formatRupees(r.laserCost), total: (t) => formatRupees(t.laserCost) },
  { id: 'rate', header: 'Job Worker Rate', cell: (r) => formatRupees(r.rate), total: (t) => formatRupees(t.rate) },
  { id: 'included', header: 'Included Materials', cell: (r) => formatRupees(r.includedMaterials), total: (t) => formatRupees(t.includedMaterials) },
  { id: 'excluded', header: 'Excluded Materials', cell: (r) => formatRupees(r.excludedMaterials), total: (t) => formatRupees(t.excludedMaterials) },
  { id: 'final', header: 'Final Cost / Pc', cell: (r) => formatRupees(r.finalCost), total: (t) => formatRupees(t.finalCost), strong: true },
];

/** Printable Job Work Summary table: the saved figures, with the columns saved in the print settings. */
export function JobWorkPrintPage() {
  const designNo = useParams().designNo ?? '';
  const query = useJobWorkCosting(designNo);

  useEffect(() => {
    document.title = `Job work costing ${designNo}`;
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
              title="JOB WORK COSTING"
              backTo={`/design-costing/${encodeURIComponent(designNo)}?tab=jobwork`}
              backLabel="Job Work Costing"
              sheet="job-work"
              columns={COLUMNS}
              components={data.calculation.components.map((c) => ({
                name: c.name,
                rows: c.sizes.map((s) => ({ ...s, entry: entries.get(rowKey(c.name, s.size)) })),
                total: c.total,
              }))}
            >
              <p className="po-order-ref">
                D.N. <strong>{data.designNo}</strong>
              </p>
            </ColumnPrintSheet>
          );
        }}
      </QueryState>
    </div>
  );
}
