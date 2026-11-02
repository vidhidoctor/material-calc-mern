import { model, Schema } from 'mongoose';

/** One record per design, separate from its design costing: saving one never touches the other. */
export interface JobWorkCosting {
  designNo: string;
  rows: {
    component: string;
    size: string;
    /** ₹ per piece agreed with the job worker. */
    rate?: number | null;
    /** Quantities for this job work only; missing or null = the Punching Master quantity, which is never changed. */
    stitch?: number | null;
    laser?: number | null;
    stitchRate?: number | null;
    laserRate?: number | null;
    /** Missing on older records and when left at the default (DEFAULT_COSTING_HEADS). */
    stitchHeads?: number;
    laserHeads?: number;
  }[];
  /**
   * Column keys of materials left out of the job work cost (already covered by the job worker's rate).
   * The excluded ones are stored, so a material added to the design later starts included.
   */
  excluded: string[];
  updatedAt: Date;
  updatedBy: string;
}

const jobWorkCostingSchema = new Schema<JobWorkCosting>(
  {
    designNo: { type: String, required: true, unique: true },
    rows: {
      type: [
        new Schema(
          {
            component: { type: String, required: true },
            size: { type: String, required: true },
            rate: { type: Number, default: null, min: 0 },
            stitch: { type: Number, default: null, min: 0 },
            laser: { type: Number, default: null, min: 0 },
            stitchRate: { type: Number, default: null, min: 0 },
            laserRate: { type: Number, default: null, min: 0 },
            stitchHeads: { type: Number, default: undefined, min: 0 },
            laserHeads: { type: Number, default: undefined, min: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    excluded: { type: [String], default: [] },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: String, required: true },
  },
  { versionKey: false },
);

export const JobWorkCostingModel = model<JobWorkCosting>('JobWorkCosting', jobWorkCostingSchema, 'jobWorkCostings');
