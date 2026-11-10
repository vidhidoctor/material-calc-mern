import { DEFAULT_COSTING_HEADS, type JobWorkCostingDto, type JobWorkInputDto } from '@app/shared';
import { useEffect, useMemo, useState } from 'react';
import { parseNumberInput } from '../../components/ui';
import { useDebounced } from '../../lib/use-debounced';
import type { BulkRates } from '../design-costing/components/BulkRateModal';
import { useJobWorkPreview, useSaveJobWorkCosting } from './job-work-costing.hooks';

export const rowKey = (component: string, size: string) => `${component}\u0000${size}`;
const text = (value: number | null) => (value === null ? '' : String(value));

/** One row as typed. Blank Stitches / Laser = the Punching Master quantity. */
export interface RowDraft {
  stitch: string;
  laser: string;
  stitchRate: string;
  laserRate: string;
  stitchHeads: string;
  laserHeads: string;
  rate: string;
  note: string;
}

interface Draft {
  rows: Record<string, RowDraft>;
  excluded: string[];
}

export const HEADS = String(DEFAULT_COSTING_HEADS);
export const NO_ROW: RowDraft = { stitch: '', laser: '', stitchRate: '', laserRate: '', stitchHeads: HEADS, laserHeads: HEADS, rate: '', note: '' };

const toDraft = (saved: JobWorkInputDto): Draft => ({
  rows: Object.fromEntries(
    saved.rows.map((r) => [
      rowKey(r.component, r.size),
      {
        stitch: text(r.stitch),
        laser: text(r.laser),
        stitchRate: text(r.stitchRate),
        laserRate: text(r.laserRate),
        stitchHeads: String(r.stitchHeads),
        laserHeads: String(r.laserHeads),
        rate: text(r.rate),
        note: r.note,
      },
    ]),
  ),
  excluded: saved.excluded,
});

function toBody(draft: Draft, data: JobWorkCostingDto): JobWorkInputDto {
  return {
    rows: data.calculation.components.flatMap((c) =>
      c.sizes.map((s) => {
        const row = draft.rows[rowKey(c.name, s.size)] ?? NO_ROW;
        return {
          component: c.name,
          size: s.size,
          stitch: parseNumberInput(row.stitch),
          laser: parseNumberInput(row.laser),
          stitchRate: parseNumberInput(row.stitchRate),
          laserRate: parseNumberInput(row.laserRate),
          // A cleared box counts as the default, as its placeholder shows.
          stitchHeads: parseNumberInput(row.stitchHeads) ?? DEFAULT_COSTING_HEADS,
          laserHeads: parseNumberInput(row.laserHeads) ?? DEFAULT_COSTING_HEADS,
          rate: parseNumberInput(row.rate),
          note: row.note,
        };
      }),
    ),
    excluded: draft.excluded,
  };
}

/** The job work entries on screen and their figures. Held by the page, so its header can show them and they survive switching tabs. */
export function useJobWorkEditor(data: JobWorkCostingDto) {
  const [draft, setDraft] = useState(() => toDraft(data.saved));
  const [dirty, setDirty] = useState(false);
  const saveMutation = useSaveJobWorkCosting(data.designNo);

  // Fresh data (e.g. after a punching edit) replaces the entries only when none are unsaved.
  useEffect(() => {
    if (!dirty) setDraft(toDraft(data.saved));
  }, [data.saved, dirty]);

  const body = useMemo(() => toBody(draft, data), [draft, data]);
  const settledBody = useDebounced(body, 300);
  const preview = useJobWorkPreview(data.designNo, settledBody, dirty);
  const calculation = (dirty ? preview.data : null) ?? data.calculation;
  const recalculating = dirty && (preview.isFetching || settledBody !== body);

  const change = (update: (current: Draft) => Draft) => {
    setDirty(true);
    setDraft(update);
  };

  return {
    draft,
    dirty,
    calculation,
    recalculating,
    error: saveMutation.error ?? (dirty ? preview.error : null),
    saving: saveMutation.isPending,
    save: () => saveMutation.mutate(body, { onSuccess: () => setDirty(false) }),
    setCell: (key: string, field: keyof RowDraft, value: string) => change((d) => ({ ...d, rows: { ...d.rows, [key]: { ...(d.rows[key] ?? NO_ROW), [field]: value } } })),
    setIncluded: (key: string, included: boolean) => change((d) => ({ ...d, excluded: included ? d.excluded.filter((k) => k !== key) : [...d.excluded, key] })),
    applyBulk: ({ component, stitch, laser, stitchHeads, laserHeads }: BulkRates) =>
      change((d) => {
        const rows = { ...d.rows };
        for (const c of data.calculation.components) {
          if (component && c.name !== component) continue;
          for (const s of c.sizes) {
            const key = rowKey(c.name, s.size);
            const current = rows[key] ?? NO_ROW;
            rows[key] = {
              ...current,
              stitchRate: stitch || current.stitchRate,
              laserRate: laser || current.laserRate,
              stitchHeads: stitchHeads || current.stitchHeads,
              laserHeads: laserHeads || current.laserHeads,
            };
          }
        }
        return { ...d, rows };
      }),
  };
}

export type JobWorkEditor = ReturnType<typeof useJobWorkEditor>;
