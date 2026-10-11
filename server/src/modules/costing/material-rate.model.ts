import { model, Schema } from 'mongoose';

/**
 * Rate per purchase unit for a material, or for one colour of it (key "SEQ-3MM|WHITE").
 * A colour without its own rate uses its material's rate.
 */
export interface MaterialRate {
  key: string;
  basicRate: number;
  gstPercent: number;
  updatedAt: Date;
  updatedBy: string | null;
}

const materialRateSchema = new Schema<MaterialRate>(
  {
    key: { type: String, required: true, unique: true },
    basicRate: { type: Number, required: true, min: 0 },
    gstPercent: { type: Number, required: true, min: 0 },
    updatedAt: { type: Date, default: () => new Date() },
    updatedBy: { type: String, default: null },
  },
  { versionKey: false },
);

export const MaterialRateModel = model<MaterialRate>('MaterialRate', materialRateSchema, 'materialRates');
