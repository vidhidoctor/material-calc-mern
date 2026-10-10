import { model, Schema, type HydratedDocument } from 'mongoose';

export interface CategoryField {
  key: string;
  label: string;
  required: boolean;
  missingMessage: string | null;
}

export interface CategoryStep {
  key: string;
  label: string;
  formula: string;
}

/** An admin-configurable material category with its purchase formula (see calculation/engine.ts). */
export interface MaterialCategory {
  code: string;
  name: string;
  unit: string;
  sortOrder: number;
  fields: CategoryField[];
  steps: CategoryStep[];
  purchaseStep: string;
}

const fieldSchema = new Schema<CategoryField>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    required: { type: Boolean, default: true },
    missingMessage: { type: String, default: null },
  },
  { _id: false },
);

const stepSchema = new Schema<CategoryStep>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    formula: { type: String, required: true },
  },
  { _id: false },
);

const categorySchema = new Schema<MaterialCategory>(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
    fields: { type: [fieldSchema], default: [] },
    steps: { type: [stepSchema], default: [] },
    purchaseStep: { type: String, required: true },
  },
  { versionKey: false },
);

export const MaterialCategoryModel = model<MaterialCategory>('MaterialCategory', categorySchema, 'materialCategories');
export type MaterialCategoryDocument = HydratedDocument<MaterialCategory>;
