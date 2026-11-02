import { DEFAULT_COSTING_HEADS, type DesignCostingDto, type DesignCostingInputDto } from '@app/shared';
import { parseNumberInput } from '../../components/ui';

export interface RateDraft {
  stitch: string;
  laser: string;
  stitchHeads: string;
  laserHeads: string;
  note: string;
}

/** The entries as typed; numbers are parsed only when sent. */
export interface Draft {
  markup: string;
  rates: Record<string, RateDraft>;
  types: Record<string, string>;
  cords: Record<string, { denier: string; rate: string }>;
}

export const NO_RATE: RateDraft = { stitch: '', laser: '', stitchHeads: String(DEFAULT_COSTING_HEADS), laserHeads: String(DEFAULT_COSTING_HEADS), note: '' };
export const rowKey = (component: string, size: string) => `${component}\u0000${size}`;
const text = (value: number | null | undefined) => (value == null ? '' : String(value));

export function toDraft(saved: DesignCostingInputDto): Draft {
  return {
    markup: String(saved.markupPercent),
    rates: Object.fromEntries(saved.rows.map((r) => [rowKey(r.component, r.size), { stitch: text(r.stitchRate), laser: text(r.laserRate), stitchHeads: String(r.stitchHeads), laserHeads: String(r.laserHeads), note: r.note }])),
    types: saved.types,
    cords: Object.fromEntries(Object.entries(saved.cords).map(([key, c]) => [key, { denier: text(c.denier), rate: text(c.ratePerUnit) }])),
  };
}

export function toBody(draft: Draft, data: DesignCostingDto): DesignCostingInputDto {
  return {
    markupPercent: parseNumberInput(draft.markup) ?? 0,
    rows: data.design.components.flatMap((c) =>
      c.sizes.map((s) => {
        const rate = draft.rates[rowKey(c.name, s.size)] ?? NO_RATE;
        return {
          component: c.name,
          size: s.size,
          stitchRate: parseNumberInput(rate.stitch),
          laserRate: parseNumberInput(rate.laser),
          // A cleared box counts as the default, as its placeholder shows.
          stitchHeads: parseNumberInput(rate.stitchHeads) ?? DEFAULT_COSTING_HEADS,
          laserHeads: parseNumberInput(rate.laserHeads) ?? DEFAULT_COSTING_HEADS,
          note: rate.note,
        };
      }),
    ),
    types: draft.types,
    cords: Object.fromEntries(Object.entries(draft.cords).map(([key, c]) => [key, { denier: parseNumberInput(c.denier), ratePerUnit: parseNumberInput(c.rate) }])),
  };
}
