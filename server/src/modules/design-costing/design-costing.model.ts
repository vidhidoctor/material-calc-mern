import { model, Schema, type HydratedDocument } from 'mongoose';

/** Rates are entered per component + size for each design: they are never kept in Material Master. */
export interface DesignCostingRow {
  component: string;
  size: string;
  stitchRate: number | null;
  laserRate: number | null;
  /** Missing on older records and when left at the default (DEFAULT_COSTING_HEADS). */
  stitchHeads?: number;
  laserHeads?: number;
  /** Remarks typed by the owner, printed as entered on the price list. Missing on older records. */
  note?: string;
}

/** One costing record per design (the punching details stay in the design). */
export interface DesignCosting {
  designNo: string;
  markupPercent: number;
  rows: DesignCostingRow[];
  /** Type costed for each typed column (lists: column keys may contain dots). */
  types: { key: string; type: string }[];
  /** Denier and ₹ per KG costed for each cord column. */
  cords: { key: string; denier: number | null; ratePerUnit: number | null }[];
  updatedAt: Date;
  updatedBy: string;
}

const rowSchema = new Schema<DesignCostingRow>(
  {
    component: { type: String, required: true },
    size: { type: String, required: true },
    stitchRate: { type: Number, default: null, min: 0 },
    laserRate: { type: Number, default: null, min: 0 },
    stitchHeads: { type: Number, default: undefined, min: 0 },
    laserHeads: { type: Number, default: undefined, min: 0 },
    note: { type: String, default: undefined },
  },
  { _id: false },
);

const designCostingSchema = new Schema<DesignCosting>(
  {
    designNo: { type: String, required: true, unique: true },
    markupPercent: { type: Number, required: true, min: 0 },
    rows: { type: [rowSchema], default: [] },
    types: { type: [new Schema({ key: { type: String, required: true }, type: { type: String, required: true } }, { _id: false })], default: [] },
    cords: {
      type: [new Schema({ key: { type: String, required: true }, denier: { type: Number, default: null }, ratePerUnit: { type: Number, default: null } }, { _id: false })],
      default: [],
    },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: String, required: true },
  },
  { versionKey: false },
);

export const DesignCostingModel = model<DesignCosting>('DesignCosting', designCostingSchema, 'designCostings');
export type DesignCostingDocument = HydratedDocument<DesignCosting>;
