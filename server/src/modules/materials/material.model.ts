import { MATERIAL_CATEGORIES, type MaterialCategory } from '@app/shared';
import { model, Schema, type HydratedDocument } from 'mongoose';

export interface Material {
  code: string;
  name: string;
  category: MaterialCategory;
  sortOrder: number;
  seqPerCd: number | null;
  cdPerRoll: number | null;
  cdPerRound: number | null;
  pcsPerKg: number | null;
  denier: number | null;
}

const rule = { type: Number, default: null };

const materialSchema = new Schema<Material>(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: MATERIAL_CATEGORIES },
    sortOrder: { type: Number, required: true, default: 0 },
    seqPerCd: rule,
    cdPerRoll: rule,
    cdPerRound: rule,
    pcsPerKg: rule,
    denier: rule,
  },
  { versionKey: false },
);

export const MaterialModel = model<Material>('Material', materialSchema, 'materials');
export type MaterialDocument = HydratedDocument<Material>;
