import { model, Schema, type HydratedDocument } from 'mongoose';

export interface Material {
  code: string;
  name: string;
  /** Material category code (see material-categories). */
  category: string;
  sortOrder: number;
  /** Values of the category's fields, e.g. { seqPerCd: 31600, cdPerRoll: 210 }. */
  rules: Record<string, number>;
}

const materialSchema = new Schema<Material>(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true },
    sortOrder: { type: Number, required: true, default: 0 },
    rules: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { versionKey: false, minimize: false },
);

export const MaterialModel = model<Material>('Material', materialSchema, 'materials');
export type MaterialDocument = HydratedDocument<Material>;
