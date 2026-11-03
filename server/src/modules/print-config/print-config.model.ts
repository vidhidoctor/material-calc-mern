import type { PrintSheet } from '@app/shared';
import { model, Schema } from 'mongoose';

/** The columns one printed costing sheet shows, for everyone who prints it (one record per sheet, not per design). */
export interface PrintConfig {
  sheet: PrintSheet;
  columns: string[];
  totals: boolean;
  updatedAt: Date;
  updatedBy: string;
}

const printConfigSchema = new Schema<PrintConfig>(
  {
    sheet: { type: String, required: true, unique: true },
    columns: { type: [String], required: true },
    totals: { type: Boolean, required: true },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: String, required: true },
  },
  { versionKey: false },
);

export const PrintConfigModel = model<PrintConfig>('PrintConfig', printConfigSchema, 'printConfigs');
