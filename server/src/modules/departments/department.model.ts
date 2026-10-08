import { model, Schema, type HydratedDocument } from 'mongoose';

export interface Department {
  name: string;
}

const departmentSchema = new Schema<Department>(
  {
    name: { type: String, required: true, trim: true },
  },
  { versionKey: false },
);

// Department names are unique ignoring case.
departmentSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const DepartmentModel = model<Department>('Department', departmentSchema, 'departments');
export type DepartmentDocument = HydratedDocument<Department>;
